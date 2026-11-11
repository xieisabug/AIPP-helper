import { Hono } from "hono";
import catalog from "./data/agent-plugins.json";

type PluginEnv = { Bindings: { ASSETS: Fetcher } };
export const agentPluginsApi = new Hono<PluginEnv>();
agentPluginsApi.get("/catalog", c => {
    const repo = c.req.query("repo") ?? "openai/plugins";
    const ref = c.req.query("ref") ?? "main";
    const entries = catalog.entries.filter(p => p.source.repo === repo && p.source.git_ref === ref);
    if (!entries.length) return c.json({error:"plugin_source_not_published",message:"此来源尚未由 AIPP 应用目录发布"},404);
    c.header("Cache-Control","public, max-age=300");
    return c.json({revision:catalog.revision,entries});
});
agentPluginsApi.get("/preview", async c => {
    const entry = catalog.entries.find(p => p.source.repo === c.req.query("repo") && p.source.git_ref === c.req.query("ref") && p.source.path === c.req.query("path"));
    if (!entry) return c.json({error:"plugin_not_published"},404);
    const response = await c.env.ASSETS.fetch(new Request(new URL(`/agent-plugins/${entry.key}.json`,c.req.url)));
    if (!response.ok) return c.json({error:"plugin_metadata_unavailable"},503);
    const headers = new Headers(response.headers);
    headers.set("Content-Type","application/json; charset=utf-8");
    headers.set("Cache-Control","public, max-age=300");
    return new Response(response.body,{status:200,headers});
});
agentPluginsApi.get("/archive", async c => {
    const entry = catalog.entries.find(p => p.source.repo === c.req.query("repo") && p.source.git_ref === c.req.query("ref") && p.source.path === c.req.query("path"));
    if (!entry) return c.json({error:"plugin_not_published"},404);
    if (c.req.query("revision") !== catalog.revision) return c.json({error:"plugin_version_changed",message:"请刷新详情后重新安装"},409);
    // Only the curated repository and immutable revision can reach upstream.
    // Stream the body through helper: never redirect the desktop to GitHub.
    const upstream = await fetch(`https://codeload.github.com/${entry.source.repo}/zip/${catalog.revision}`, {redirect:"manual",headers:{"User-Agent":"AIPP-helper"},cf:{cacheEverything:true,cacheTtl:86400}});
    if (!upstream.ok) return c.json({error:"plugin_archive_unavailable",status:upstream.status},502);
    return new Response(upstream.body,{headers:{"Content-Type":"application/zip","Cache-Control":"public, max-age=86400", "X-AIPP-Revision":catalog.revision}});
});
