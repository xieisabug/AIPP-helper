import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const bundled = await build({ entryPoints: ['src/worker/index.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
test('catalog endpoint returns versioned applications and supports conditional cache', async () => {
    const response = await worker.request('https://helper.example/api/apps');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /json/);
    const catalog = await response.json();
    assert.equal(catalog.schema_version, 1);
    assert.equal(new Set(catalog.apps.map(app => app.id)).size, catalog.apps.length);
    assert.ok(catalog.apps.some(app => app.connection.auth === 'oauth'));
    assert.ok(catalog.apps.some(app => app.connection.auth === 'fields'));
    const cached = await worker.request('https://helper.example/api/apps', { headers: { 'If-None-Match': response.headers.get('etag') } });
    assert.equal(cached.status, 304);
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
