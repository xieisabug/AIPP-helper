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
        assert.equal(app.connection.transport, 'http');
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
    assert.equal(ids.size,63);
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
