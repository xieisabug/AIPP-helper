import { Hono } from "hono";
import catalog from "./data/apps.json";
import summaries from "./data/mcp-tool-summaries.json";

const english: Record<string, { description: string; notice: string; category: string }> = {
    notion: { description: "Search, read, and edit pages in your Notion workspace.", notice: "Authorize your workspace in the browser. Notion determines permissions, billing, and quotas.", category: "Productivity" },
    github: { description: "Explore repositories and manage issues and pull requests.", notice: "Connect with a personal access token. Its permissions and organization policies determine the available resources.", category: "Developer tools" },
    runway: { description: "Generate images and videos with Runway in your conversation.", notice: "Sign in to Runway in your browser. Generations, retries and regenerations consume credits.", category: "Creative tools" },
};

function localized(app: typeof catalog.apps[number], language: "en" | "zh-CN") {
    const tools = summaries[app.id as keyof typeof summaries] ?? {};
    return {
        ...app, ...(language === "en" ? english[app.id] : {}),
        tool_summaries: Object.fromEntries(Object.entries(tools).map(([name, text]) => [name, text[language]])),
    };
}

// A versioned catalog, independent of the existing Skills and plugin package APIs.
export const appsApi = new Hono();
appsApi.get("/", (c) => {
    c.header("Cache-Control", "public, max-age=300");
    const language = c.req.query("lang") === "en" ? "en" : "zh-CN";
    const candidate = c.req.header("If-None-Match");
    const etag = `"apps-${catalog.version}${language === "en" ? "-en" : ""}"`;
    c.header("ETag", etag);
    // Cloudflare may weaken ETags after content encoding. GET uses weak comparison.
    if (candidate?.trim() === "*" || candidate?.split(",").some(value => value.trim().replace(/^W\//, "") === etag)) return c.body(null, 304);
    return c.json({ ...catalog, apps: catalog.apps.map(app => localized(app, language)) });
});
appsApi.get("/:id", (c) => {
    const entry = catalog.apps.find(app => app.id === c.req.param("id"));
    if (!entry) return c.json({ error: "app_not_found" }, 404);
    return c.json({ schema_version: catalog.schema_version, app: localized(entry, c.req.query("lang") === "en" ? "en" : "zh-CN") });
});
