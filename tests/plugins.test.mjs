import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { build } from 'esbuild';

const bundle = async (entry) => {
    const out = await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', write: false });
    return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`);
};
const { default: worker } = await bundle('src/worker/index.ts');
const { parseVersion, compareVersions, pluginsForClient } = await bundle('src/worker/plugin-version.ts');
const { plugins: releases } = await bundle('src/worker/data/plugins.ts');

const list = async (init, query = '') => (await worker.request(`https://helper.example/api/plugins${query}`, init)).json();
const forVersion = (version) => list({ headers: { 'X-AIPP-Version': version } });
const versionOf = (items, code) => items.find((p) => p.code === code)?.version;
const PREVIEW_PREFIX = 'https://aipp-helper.xiejingyang.com/plugin-previews/';

test('clients without the version header are treated as 1.2.0, the oldest with the plugin list', async () => {
    const legacy = await list();
    assert.ok(legacy.some((p) => p.code === 'directory-bang-plugin'));
    for (const code of ['office-preview-plugin', 'cat-avatar-plugin', 'comfyui-image-plugin']) {
        assert.ok(!legacy.some((p) => p.code === code), code);
    }
    // The 0.2.0 theme needs the activeTheme slot context from 1.4.0, so they keep 0.1.0.
    assert.equal(versionOf(legacy, 'guofeng-zhusha-theme-plugin'), '0.1.0');
});

test('older clients keep the last release they can run instead of losing the plugin', async () => {
    assert.equal(versionOf(await forVersion('1.3.9'), 'guofeng-zhusha-theme-plugin'), '0.1.0');
    assert.equal(versionOf(await forVersion('1.4.0'), 'guofeng-zhusha-theme-plugin'), '0.2.0');
    assert.ok(!(await forVersion('1.3.9')).some((p) => p.code === 'comfyui-image-plugin'));
    assert.ok((await forVersion('1.4.0')).some((p) => p.code === 'comfyui-image-plugin'));
});

test('plugins appear once the client meets minAippVersion', async () => {
    assert.ok(!(await forVersion('1.6.1')).some((p) => p.code === 'office-preview-plugin'));
    for (const version of ['1.6.2', '1.7.0', '2.0.0', '1.6.2-beta.1']) {
        assert.ok((await forVersion(version)).some((p) => p.code === 'office-preview-plugin'), version);
    }
    assert.ok(!(await forVersion('1.6.3')).some((p) => p.code === 'cat-avatar-plugin'));
    assert.ok((await forVersion('1.6.4')).some((p) => p.code === 'cat-avatar-plugin'));
    // query override for manual inspection
    assert.ok((await list(undefined, '?aippVersion=1.6.2')).some((p) => p.code === 'office-preview-plugin'));
});

test('each client sees every plugin at most once', async () => {
    for (const version of ['1.2.0', '1.4.0', '1.6.4', '99.0.0']) {
        const codes = (await forVersion(version)).map((p) => p.code);
        assert.equal(new Set(codes).size, codes.length, version);
    }
});

test('malformed versions fall back to the legacy client and responses vary by the header', async () => {
    const response = await worker.request('https://helper.example/api/plugins', { headers: { 'X-AIPP-Version': 'garbage' } });
    assert.equal(response.headers.get('vary'), 'X-AIPP-Version');
    assert.ok(!(await response.json()).some((p) => p.code === 'office-preview-plugin'));
});

// The client only marks an install "official" when the catalog entry carries a sha256 and the
// installed dirs match it (verify_official_install), so every release must have both.
test('every release can be verified as official: sha256, archive-root dirs, own zip', () => {
    for (const plugin of releases) {
        const label = `${plugin.code}@${plugin.version}`;
        assert.match(plugin.sha256, /^sha256:[0-9a-f]{64}$/, label);
        assert.deepEqual(plugin.dirs, [{ from: '.', to: plugin.code }], label);
        assert.ok(plugin.source.url.endsWith(`/${plugin.code}-${plugin.version}.aipp-plugin.zip`), label);
    }
});

test('preview images are trusted helper URLs that the helper actually hosts', () => {
    for (const plugin of releases) {
        assert.ok((plugin.previewImages ?? []).length <= 6, plugin.code);
        for (const url of plugin.previewImages ?? []) {
            assert.ok(url.startsWith(PREVIEW_PREFIX), url);
            assert.ok(existsSync(`public/plugin-previews/${url.slice(PREVIEW_PREFIX.length)}`), url);
        }
    }
});

test('pluginsForClient picks the newest compatible release per code', () => {
    const release = (version, minAippVersion) => ({ code: 'demo', version, minAippVersion });
    const all = [release('0.1.0', '0.4.0'), release('0.3.0', '2.0.0'), release('0.2.0', '1.4.0'), { code: 'other', version: '1.0.0' }];
    assert.deepEqual(pluginsForClient(all, [1, 5, 0]).map((p) => `${p.code}@${p.version}`), ['demo@0.2.0', 'other@1.0.0']);
    assert.deepEqual(pluginsForClient(all, [1, 0, 0]).map((p) => p.version), ['0.1.0', '1.0.0']);
    assert.deepEqual(pluginsForClient([release('0.2.0', '9.0.0')], [1, 0, 0]), []);
});

test('version parsing compares numerically, not lexically', () => {
    assert.deepEqual(parseVersion('v1.10.0'), [1, 10, 0]);
    assert.equal(parseVersion('1.6'), null);
    assert.ok(compareVersions(parseVersion('1.10.0'), parseVersion('1.9.9')) > 0);
    assert.equal(compareVersions(parseVersion('1.6.2+build.5'), parseVersion('1.6.2')), 0);
});
