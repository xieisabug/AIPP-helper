import { Hono } from "hono";
import simularBox from "./data/simular-box-plugin.json";
import catalog from "./data/agent-plugins.json";

import chinese from "./data/plugin-descriptions.zh-CN.json";

function description(path: string, original: string, lang?: string) {
    return lang === "zh-CN" ? (chinese as Record<string, string>)[path] ?? original : original;
}

const releases = [catalog, simularBox];
function releaseFor(repo: string | undefined, ref: string | undefined) {
    return releases.find(release => release.entries.some(p => p.source.repo === repo && p.source.git_ref === ref));
}

type PluginEnv = { Bindings: { ASSETS: Fetcher } };
export const agentPluginsApi = new Hono<PluginEnv>();
agentPluginsApi.get("/catalog", c => {
    const repo = c.req.query("repo") ?? "openai/plugins";
    const ref = c.req.query("ref") ?? "main";
    const release = releaseFor(repo, ref);
    const entries = release?.entries.filter(p => p.source.repo === repo && p.source.git_ref === ref);
    if (!release || !entries?.length) return c.json({error:"plugin_source_not_published",message:"此来源尚未由 AIPP 应用目录发布"},404);
    c.header("Cache-Control","public, max-age=300");
    return c.json({revision:release.revision,entries:entries.map(entry => ({...entry, description:description(entry.source.path, entry.description, c.req.query("lang"))}))});
});
agentPluginsApi.get("/preview", async c => {
    const release = releaseFor(c.req.query("repo"), c.req.query("ref"));
    const entry = release?.entries.find(p => p.source.repo === c.req.query("repo") && p.source.git_ref === c.req.query("ref") && p.source.path === c.req.query("path"));
    if (!release || !entry) return c.json({error:"plugin_not_published"},404);
    const response = await c.env.ASSETS.fetch(new Request(new URL(`/agent-plugins/${entry.key}.json`,c.req.url)));
    if (!response.ok) return c.json({error:"plugin_metadata_unavailable"},503);
    if (c.req.query("lang") === "zh-CN") {
        const preview = await response.json<{description:string}>();
        c.header("Cache-Control", "public, max-age=300");
        return c.json({...preview, description:description(entry.source.path,preview.description,"zh-CN")});
    }
    const headers = new Headers(response.headers);
    headers.set("Content-Type","application/json; charset=utf-8");
    headers.set("Cache-Control","public, max-age=300");
    return new Response(response.body,{status:200,headers});
});
agentPluginsApi.get("/archive", async c => {
    const release = releaseFor(c.req.query("repo"), c.req.query("ref"));
    const entry = release?.entries.find(p => p.source.repo === c.req.query("repo") && p.source.git_ref === c.req.query("ref") && p.source.path === c.req.query("path"));
    if (!release || !entry) return c.json({error:"plugin_not_published"},404);
    if (c.req.query("revision") !== release.revision) return c.json({error:"plugin_version_changed",message:"请刷新详情后重新安装"},409);
    const response = await c.env.ASSETS.fetch(new Request(new URL(entry.archive.path, c.req.url)));
    if (!response.ok) return c.json({error:"plugin_archive_unavailable"},503);
    const headers = new Headers(response.headers);
    headers.set("Content-Type", "application/zip");
    headers.set("Content-Length", String(entry.archive.bytes));
    headers.set("Cache-Control", "public, max-age=86400");
    headers.set("X-AIPP-Revision", release.revision);
    headers.set("X-AIPP-SHA256", entry.archive.sha256);
    return new Response(response.body, {headers});
});
