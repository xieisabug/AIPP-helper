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
    // Publish immutable archive chunks with the metadata; never contact GitHub at install time.
    const parts = catalog.archive.parts;
    let index = 0;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
            try {
                while (index < parts.length) {
                    if (!reader) {
                        const response = await c.env.ASSETS.fetch(new Request(new URL(parts[index], c.req.url)));
                        if (!response.ok || !response.body) throw new Error(`Published archive part ${index} is unavailable`);
                        reader = response.body.getReader();
                    }
                    const next = await reader.read();
                    if (next.done) { reader.releaseLock(); reader = undefined; index++; continue; }
                    controller.enqueue(next.value); return;
                }
                controller.close();
            } catch (error) { controller.error(error); }
        },
        async cancel() { await reader?.cancel(); },
    });
    return new Response(stream,{headers:{"Content-Type":"application/zip","Cache-Control":"public, max-age=86400", "X-AIPP-Revision":catalog.revision, "X-AIPP-SHA256":catalog.archive.sha256}});
});
