import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
const bundled = await build({entryPoints:['src/worker/index.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {default: worker} = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const env = {ASSETS:{fetch:async request => { const path=new URL(request.url).pathname;try {return new Response(await readFile(`public${path}`),{headers:{'content-type':'application/json'}});}catch{return new Response('',{status:404});}}}};
test('published catalog and Notion details are available without upstream fetch', async () => {
    const original=globalThis.fetch;globalThis.fetch=()=>{throw new Error('metadata must not fetch GitHub');};
    try {
        const res=await worker.request('https://helper.example/api/agent-plugins/catalog?repo=openai/plugins&ref=main',{},env);
        assert.equal(res.status,200);const catalog=await res.json();assert.equal(catalog.entries.length,62);
        const detail=await worker.request('https://helper.example/api/agent-plugins/preview?repo=openai/plugins&ref=main&path=plugins/notion',{},env);
        assert.equal(detail.status,200);const preview=await detail.json();assert.equal(preview.skills.length,4);assert.match(preview.digest,/^[a-f0-9]{64}$/);assert.ok(preview.skills.every(s=>s.content));
        const app=await (await worker.request('https://helper.example/api/apps/notion',{},env)).json();assert.deepEqual(app.app.plugin_source,preview.source);
    } finally {globalThis.fetch=original;}
});
test('archive rejects arbitrary sources and revisions before contacting upstream', async () => {
    for(const query of ['repo=attacker/repo&ref=main&path=plugins/notion&revision=bad','repo=openai/plugins&ref=main&path=plugins/notion&revision=bad']) {
        const response=await worker.request(`https://helper.example/api/agent-plugins/archive?${query}`,{},env);assert.ok([404,409].includes(response.status));
    }
});
test('archive streams through helper without redirecting the desktop', async () => {
    const original=globalThis.fetch;
    globalThis.fetch=async (url,options)=>{assert.equal(options.redirect,'manual');assert.equal(String(url),'https://codeload.github.com/openai/plugins/zip/d420d13051bffe4543ed39e30fa46b87148e47dd');return new Response('zip-body');};
    try {const response=await worker.request('https://helper.example/api/agent-plugins/archive?repo=openai/plugins&ref=main&path=plugins/notion&revision=d420d13051bffe4543ed39e30fa46b87148e47dd',{},env);assert.equal(response.status,200);assert.equal(response.headers.get('location'),null);assert.equal(await response.text(),'zip-body');}finally{globalThis.fetch=original;}
});
