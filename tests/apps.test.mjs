import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const bundled = await build({ entryPoints: ['src/worker/index.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const env={ASSETS:{fetch:async request=>new Response(await readFile('public'+new URL(request.url).pathname))}};
test('home supports conditional requests and previous desktop clients', async () => {
    const url='https://helper.example/api/apps';
    const response=await worker.request(url);
    const home=await response.json();
    assert.ok(home.categories.length);
    assert.equal(home.apps,undefined);
    const etag=response.headers.get('etag');
    for(const candidate of [etag,'W/'+etag,'*']) {
        assert.equal((await worker.request(url,{headers:{'If-None-Match':candidate}})).status,304);
    }
    const legacy=await (await worker.request(url,{headers:{Accept:'*/*'}})).json();
    assert.ok(legacy.apps.some(a=>a.id==='runway' && a.connection.auth==='oauth'));
    assert.ok(legacy.apps.every(a=>!a.tool_summaries));
});
test('Runway detail includes the OAuth recipe, official icon and tool summaries', async () => {
    const {app}=await (await worker.request('https://helper.example/api/apps/runway',{},env)).json();
    assert.equal(app.icon,'https://aipp-helper.xiejingyang.com/agent-plugin-icons/runway.png');
    const logo=await readFile('public'+new URL(app.icon).pathname);
    assert.equal(logo.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(app.connection.auth,'oauth');
    assert.equal(Object.keys(app.tool_summaries).length,48);
});
test('Simular Box is discoverable and links its OAuth connection to the pinned desktop skill', async () => {
    const base = 'https://helper.example/api';
    const get = async path => (await worker.request(base + path, {}, env)).json();
    const {items} = await get('/apps/page?category=development&scope=native&q=simular');
    assert.deepEqual(items.map(item => item.id), ['simular-box']);
    const {app} = await get('/apps/simular-box');
    assert.deepEqual(app.connection, {
        transport: 'http', url: 'https://mcp.box.simular.ai/mcp', auth: 'oauth', scopes: ['boxes', 'connect'],
    });
    const english = (await get('/apps/simular-box?lang=en')).app;
    assert.deepEqual(Object.keys(app.tool_summaries), Object.keys(english.tool_summaries));
    assert.notEqual(app.tool_summaries.shell, english.tool_summaries.shell);
    assert.deepEqual(app.skill_ids, []);
    const source = app.plugin_source;
    const params = new URLSearchParams({repo: source.repo, ref: source.git_ref, path: source.path});
    const preview = await get('/agent-plugins/preview?' + params);
    assert.equal(preview.revision, '2500c46b5bca1d6cda1af20c4d66381bb74c03ee');
    assert.deepEqual(preview.skills.map(s => s.name), ['box', 'get-started']);
    assert.equal(preview.servers[0].config.url, app.connection.url);
    const archive = await worker.request(base + '/agent-plugins/archive?' + params + '&revision=' + preview.revision, {}, env);
    assert.equal(archive.status, 200);
    assert.equal(archive.headers.get('x-aipp-revision'), preview.revision);
    assert.ok(app.icon.startsWith('https://aipp-helper.xiejingyang.com/agent-plugin-icons/'));
    const logo = await readFile('public' + new URL(app.icon).pathname);
    assert.equal(logo.subarray(0,8).toString('hex'), '89504e470d0a1a0a');
});
test('Gamma is discoverable with workspace OAuth and image export tools', async () => {
    const base = 'https://helper.example/api/apps';
    const page = await (await worker.request(base + '/page?scope=native&category=creative&q=gamma')).json();
    assert.deepEqual(page.items.map(item => item.id).sort(), ['gamma', 'gamma-api']);
    for (const lang of ['zh-CN', 'en']) {
        const {app} = await (await worker.request(base + '/gamma?lang=' + lang, {}, env)).json();
        assert.equal(app.connection.url, 'https://mcp.gamma.app/mcp');
        assert.equal(app.connection.oauth_resource, 'https://mcp.gamma.app');
        assert.deepEqual(app.connection.scopes, ['generate', 'gamma:read']);
        assert.equal(app.connection.auth, 'oauth');
        assert.deepEqual(app.skill_ids, []);
        assert.equal(app.plugin_source, undefined);
        assert.ok(app.tool_summaries.generate_image && app.tool_summaries.export_gamma);
    }
});
test('unknown app returns a JSON 404 instead of the SPA', async () => {
    const response = await worker.request('https://helper.example/api/apps/not-found');
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error, 'app_not_found');
});
test('existing Skills and plugin catalog endpoints remain available', async () => {
    for (const path of ['skills', 'plugins']) {
        const response = await worker.request(`https://helper.example/api/${path}`);
        assert.equal(response.status, 200);
        assert.ok(Array.isArray(await response.json()));
    }
});
test('application manifests contain no secret defaults or executable hooks', async () => {
    const catalog = JSON.parse(await readFile('src/worker/data/apps.json', 'utf8'));
    for (const app of catalog.apps) {
        assert.equal(new URL(app.connection.url).protocol, 'https:');
        assert.ok(['http', 'http_api'].includes(app.connection.transport));
        assert.equal(app.connection.command, undefined);
        assert.ok(app.platforms.length);
        for (const field of app.fields) if (field.secret) assert.ok(!field.default);
    }
});
test('home previews are bounded and pages cover the directory exactly once', async () => {
    const base='https://helper.example/api/apps';
    const res=await worker.request(base+'?lang=zh-CN');
    const raw=await res.text();
    const home=JSON.parse(raw);
    assert.ok(Buffer.byteLength(raw)<24000);
    for (const field of ['tool_summaries','connection','archive','fields','skills']) assert.ok(!raw.includes('"'+field+'":'));
    const ids=new Set();
    for (const group of home.categories) {
        assert.equal(group.items.length,Math.min(6,group.total));
        const all=[];
        let cursor=0;
        do {
            const page=await (await worker.request(base+'/page?category='+group.id+'&cursor='+cursor+'&version='+home.version)).json();
            assert.ok(page.items.length<=18);
            all.push(...page.items); cursor=page.next_cursor;
        } while(cursor!==null);
        assert.equal(all.length,group.total);
        assert.deepEqual(all.slice(0,6),group.items);
        for(const item of all){assert.ok(!ids.has(item.id));ids.add(item.id);}
    }
    assert.equal(ids.size,66);
    const search=await (await worker.request(base+'/page?q=zotero')).json();
    assert.ok(search.items.some(e=>e.name.toLowerCase()==='zotero'));
    assert.equal((await worker.request(base+'/page?version=stale')).status,409);
    assert.equal((await worker.request(base+'/page?cursor=-1')).status,400);
    const detail=async lang=>(await (await worker.request(base+'/runway?lang='+lang,{},env)).json()).app;
    const zh=await detail('zh-CN'),en=await detail('en');
    assert.deepEqual(Object.keys(zh.tool_summaries),Object.keys(en.tool_summaries));
    assert.notEqual(zh.tool_summaries.generate_video,en.tool_summaries.generate_video);
    console.log('Home bytes:',Buffer.byteLength(raw),'groups:',home.categories.length,'items:',ids.size);
});

test('Gamma API key detail publishes complete REST operations and keeps credentials client-side', async () => {
    const base = 'https://helper.example/api/apps';
    const zh = (await (await worker.request(base + '/gamma-api', {}, env)).json()).app;
    const en = (await (await worker.request(base + '/gamma-api?lang=en', {}, env)).json()).app;
    assert.equal(zh.connection.url, 'https://public-api.gamma.app');
    assert.equal(zh.connection.transport, 'http_api');
    assert.equal(zh.connection.auth, 'fields');
    assert.equal(zh.fields[0].header, 'X-API-KEY');
    assert.equal(zh.fields[0].secret, true);
    const api = zh.connection.http_api;
    assert.equal(api.key_url, 'https://gamma.app/settings/api-keys');
    assert.equal(api.probe, 'get_me');
    const cases = JSON.parse(await readFile('tests/fixtures/gamma-api-cases.json', 'utf8'));
    const names = api.tools.map(t => t.name).sort();
    assert.equal(names.length, 26);
    assert.deepEqual(names, [...new Set(cases.map(c => c.tool))].sort());
    assert.deepEqual(names, Object.keys(zh.tool_summaries).sort());
    assert.deepEqual(names, Object.keys(en.tool_summaries).sort());
    for (const c of cases) {
        const op = api.tools.find(t => t.name === c.tool);
        const path = op.path.replace(/\{(\w+)\}/g, (_, key) => encodeURIComponent(c.args[key]));
        assert.equal(op.method + ' ' + path, c.wire.split('?')[0]);
        for (const key of op.input_schema.required ?? []) assert.ok(key in c.args);
    }
    const image = cases.find(c => c.tool === 'create_image_generation').reply;
    const imageResult = cases.find(c => c.tool === 'get_image_generation_status' && c.args.id === image.imageGenerationId).reply;
    assert.equal(imageResult.status, 'completed');
    assert.match(imageResult.image.url, /\.png$/);
    const generation = cases.find(c => c.tool === 'create_generation').reply;
    const deck = cases.find(c => c.tool === 'get_generation_status' && c.args.id === generation.generationId).reply;
    assert.equal(deck.status, 'completed');
    for (const format of ['pptx', 'pdf']) {
        const job = cases.find(c => c.tool === 'export_gamma' && c.args.gammaId === deck.gammaId && c.args.body.exportAs === format).reply;
        const file = cases.find(c => c.tool === 'get_export_status' && c.args.id === job.exportId).reply;
        assert.equal(file.status, 'completed');
        assert.ok(file.exportUrl.endsWith('.' + format));
    }
    assert.deepEqual(en.connection, zh.connection);
    const old = await (await worker.request(base, {headers:{Accept:'*/*'}})).json();
    assert.ok(!old.apps.some(a => a.id === 'gamma-api'));
    assert.ok(old.apps.some(a => a.id === 'gamma'));
});
