import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const out = await build({ entryPoints: ['src/worker/index.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
const url = 'https://helper.example/api/onboarding';

test('serves a compatible preset, caches model aliases, and refreshes them on schedule', async t => {
    let cached;
    let rotated = false;
    t.mock.method(globalThis, 'fetch', async url => {
        assert.equal(url, 'https://models.dev/catalog.json');
        return Response.json({ models: {'deepseek/base': {benchmarks:[
                {name:'IFBench',score:80}, {name:'Terminal-Bench',score:63,version:'4.0',harness:'one'},
                {name:'Terminal-Bench',score:70,version:'2.1',harness:'two'},
                {name:'HarmBench',metric:'attack success rate',score:95},
            ]}}, providers: {
        deepseek: { models: rotated ? {
            "deepseek-v6-flash-preview": {name: "V6 Flash Preview", release_date:"2028-01-01"},
            "deepseek-v5-flash": {name: "V5 Flash", release_date:"2027-01-01"},
            "deepseek-v4-pro": {name: "V4 Pro"},
        } : { 'deepseek-flash': { canonical_model_id:'deepseek/base', cost:{input:0.15,output:0.6}, name: 'DeepSeek Flash Example', limit: {context: 65536, input: 62000, output: 4096} } } },
        relay: { models: {
            'private-label': { id: 'private-label', base_model: 'deepseek/deepseek-flash' },
            'another-alias': { name: 'DeepSeek Flash Example' },
            'unrelated-larger-model': { name: 'DeepSeek Flash Example XL' },
        } },
    }}); });
    const original = globalThis.caches;
    globalThis.caches = { default: {
        match: async () => cached?.clone(),
        put: async (_, response) => { cached = response; },
    } };
    try {
        assert.equal((await worker.request(url)).status, 426);
        const headers = { 'X-AIPP-Version': '1.6.6' };
        const response = await worker.request(url, { headers });
        assert.equal(response.headers.get('Vary'), 'X-AIPP-Version');
        const data = await response.json();
        assert.equal(data.schema_version, 1);
        assert.equal(data.recommendation_catalog.providers.deepseek.models["deepseek-flash"].model, "deepseek/base");
        assert.equal(data.recommendation_catalog.providers.deepseek.models["deepseek-flash"].input, 0.15);
        const scores = data.recommendation_catalog.benchmarks["deepseek/base"];
        assert.deepEqual(scores.map(row => row.score), [80,63,70]);
        assert.notEqual(scores[1].test, scores[2].test);
        assert.deepEqual(data.recommended_provider.models, {main: "deepseek-flash", light: "deepseek-flash", review: "deepseek-flash"});
        assert.deepEqual(data.model_limits["deepseek/deepseek-flash"], {context: 62000, output: 4096});
        const aliases = data.model_ranking.light.find(m => m.base === 'deepseek/deepseek-flash').aliases;
        assert.ok(aliases.includes('private-label') && aliases.includes('another-alias'));
        assert.ok(!aliases.includes('unrelated-larger-model'));
        await worker.request(url, { headers });
        assert.equal(fetch.mock.callCount(), 1);
        rotated = true;
        await worker.scheduled();
        const updated = await (await worker.request(url, { headers })).json();
        assert.deepEqual(Object.values(updated.recommended_provider.models), Array(3).fill("deepseek-v5-flash"));
        assert.ok(updated.model_ranking.main[0].aliases.includes("deepseek-v5-flash"));
        assert.equal(fetch.mock.callCount(), 2);
    } finally { globalThis.caches = original; }
});
