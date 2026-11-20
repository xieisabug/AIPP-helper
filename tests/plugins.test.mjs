import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = async (entry) => {
    const out = await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', write: false });
    return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
};
const { default: worker } = await bundle('src/worker/index.ts');
const { parseVersion, compareVersions } = await bundle('src/worker/plugin-version.ts');

const codes = async (init, query = '') =>
    (await (await worker.request(`https://helper.example/api/plugins${query}`, init)).json()).map((p) => p.code);

test('clients without the version header are treated as 1.6.1 and do not see newer plugins', async () => {
    const legacy = await codes();
    assert.ok(legacy.includes('directory-bang-plugin'));
    assert.ok(!legacy.includes('office-preview-plugin'));
});

test('plugins appear once the client meets minAippVersion', async () => {
    assert.ok(!(await codes({ headers: { 'X-AIPP-Version': '1.6.1' } })).includes('office-preview-plugin'));
    for (const version of ['1.6.2', '1.7.0', '2.0.0', '1.6.2-beta.1']) {
        assert.ok((await codes({ headers: { 'X-AIPP-Version': version } })).includes('office-preview-plugin'), version);
    }
    // query override for manual inspection
    assert.ok((await codes(undefined, '?aippVersion=1.6.2')).includes('office-preview-plugin'));
});

test('malformed versions fall back to the legacy client and responses vary by the header', async () => {
    const response = await worker.request('https://helper.example/api/plugins', { headers: { 'X-AIPP-Version': 'garbage' } });
    assert.equal(response.headers.get('vary'), 'X-AIPP-Version');
    assert.ok(!(await response.json()).some((p) => p.code === 'office-preview-plugin'));
});

test('every entry installs from the archive root', async () => {
    const all = await (await worker.request('https://helper.example/api/plugins?aippVersion=99.0.0')).json();
    for (const plugin of all) assert.deepEqual(plugin.dirs, [{ from: '.', to: plugin.code }], plugin.code);
});

test('version parsing compares numerically, not lexically', () => {
    assert.deepEqual(parseVersion('v1.10.0'), [1, 10, 0]);
    assert.equal(parseVersion('1.6'), null);
    assert.ok(compareVersions(parseVersion('1.10.0'), parseVersion('1.9.9')) > 0);
    assert.equal(compareVersions(parseVersion('1.6.2+build.5'), parseVersion('1.6.2')), 0);
});
