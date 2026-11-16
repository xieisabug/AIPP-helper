import { Hono, type Context } from "hono";
import catalog from "./data/apps.json";
import plugins from "./data/agent-plugins.json";
import translations from "./data/plugin-descriptions.zh-CN.json";

const groups = [
    ["productivity", "效率与协作", "Productivity", "notion airtable atlassian-rovo clickup dropbox gmail google-calendar google-drive granola linear monday-com outlook-calendar outlook-email sharepoint slack teams zoom"],
    ["development", "开发工具", "Developer tools", "github simular-box build-ios-apps build-macos-apps build-web-apps circleci cloudflare coderabbit codex-security datadog expo lovable nvidia openai-developers plugin-eval sentry supabase superpowers temporal test-android-apps twilio-developer-kit vercel"],
    ["creative", "设计与创作", "Design and media", "runway adobe canva chatcut creative-production figma game-studio higgsfield hyperframes magicpath product-design remotion"],
    ["research", "数据与研究", "Data and research", "boltz-api-cli build-web-data-visualization consensus data-analytics life-science-research mixpanel-headless ngs-analysis posthog public-equity-investing zotero"],
    ["commerce", "商务与营销", "Commerce", "openai-ads-conversions shopify stripe"],
    ["other", "其他", "Other", ""],
] as const;
const classification = new Map(groups.flatMap(g => g[3].split(" ").map(slug => [slug, g[0]] as const)));
const version = catalog.version + "." + plugins.revision.slice(0, 12);
const english: Record<string, string> = {
    notion: "Search, read, and edit pages in your Notion workspace.",
    github: "Explore repositories and manage issues and pull requests.",
    "simular-box": "Give your AI a cloud Linux desktop to use Chrome and desktop apps, run commands, and work with files.",
    runway: "Generate images and videos with Runway in your conversation.",
};
type Lang = "zh-CN" | "en";
const lang = (c: Context): Lang => c.req.query("lang") === "en" ? "en" : "zh-CN";
const byId = new Map(catalog.apps.map(a => [a.id, a]));
const sources = new Map(plugins.entries.map(p => [p.source.path,p]));
const connected = new Set(catalog.apps.map(a => a.plugin_source?.path));
function index(language: Lang, nativeOnly: boolean) {
    const native = catalog.apps.map(app => {
        const plugin = sources.get(app.plugin_source?.path ?? "");
        return {id:app.id, name:app.name, publisher:app.publisher, description:language === "en" ? english[app.id] ?? app.description : app.description,
            source:app.plugin_source, icon:plugin?.icon ?? app.icon, icon_dark:plugin?.icon_dark, kind:"app"};
    });
    const extra = nativeOnly ? [] : plugins.entries.filter(p => !connected.has(p.source.path)).map(p => ({
        id:p.source.path, name:p.name, publisher:"", description:(language === "zh-CN" ? (translations as Record<string,string>)[p.source.path] : undefined) ?? p.description,
        source:p.source, icon:p.icon, icon_dark:p.icon_dark, kind:"plugin",
    }));
    const entries = [...native,...extra].map(p => ({...p, description:Array.from(p.description).slice(0,160).join(""),
        group:classification.get(p.id.replace(/^plugins\//,"")) ?? "other"}));
    const sections = groups.map(([id,zh,en]) => ({id,name:language === "en" ? en : zh,items:entries.filter(e=>e.group===id)})).filter(g=>g.items.length);
    return {entries, sections, home:{version, categories:sections.map(g=>({id:g.id,name:g.name,total:g.items.length,items:g.items.slice(0,6)}))}};
}
// Immutable release data: index and serialize the four possible homepages once per Worker isolate.
const indexes = new Map(["zh-CN","en"].flatMap(l=>[false,true].map(native=>{
    const data=index(l as Lang,native);
    const featured = new Set(data.home.categories.flatMap(g=>g.items.map(i=>i.id)));
    const legacyBody = JSON.stringify({...data.home,schema_version:1,apps:catalog.apps.filter(a=>featured.has(a.id))});
    const searchText = new Map(data.entries.map(e=>[e.id,(e.name+" "+e.description+" "+e.publisher).toLowerCase()]));
    return [l+native,{...data,body:JSON.stringify(data.home),legacyBody,searchText}] as const;
})));
function headers(c: Context, tag: string) {
    const etag = '"' + tag + '"';
    c.header("Cache-Control","public, max-age=300");
    c.header("ETag",etag);
    return c.req.header("If-None-Match")?.split(",").some(v=>v.trim()==="*" || v.trim().replace(/^W\//,"")===etag);
}
export const appsApi = new Hono<{Bindings: {ASSETS: Fetcher}}>();
appsApi.get("/", c => {
    const key=lang(c)+(c.req.query("scope")==="native");
    const data=indexes.get(key)!;
    // Bare v1 clients still need the connection recipes of the featured native apps.
    const bare = !new URL(c.req.url).search;
    const legacy = bare && c.req.header("Accept") === "*/*" && !c.req.header("User-Agent");
    if (bare) c.header("Vary", "Accept, User-Agent");
    if (headers(c,version+key+(legacy?"-v1":""))) return c.body(null,304);
    c.header("Content-Type","application/json; charset=utf-8");
    return c.body(legacy ? data.legacyBody : data.body);
});
appsApi.get("/page", c => {
    const language=lang(c), native=c.req.query("scope")==="native", data=indexes.get(language+native)!;
    const group=c.req.query("category") ?? "", q=(c.req.query("q")??"").trim().toLowerCase();
    const offset=Number(c.req.query("cursor")??0);
    if (q.length>120 || !Number.isSafeInteger(offset) || offset<0) return c.json({error:"invalid_page"},400);
    if (c.req.query("version") && c.req.query("version")!==version) return c.json({error:"catalog_changed"},409);
    const section=data.sections.find(s=>s.id===group);
    if (group && !section) return c.json({error:"unknown_category"},404);
    const rows=section?.items ?? data.entries;
    const items: typeof data.entries = [];
    let position=offset;
    while (position<rows.length && items.length<18) {
        const item=rows[position++];
        if (!q || data.searchText.get(item.id)!.includes(q)) items.push(item);
    }
    while (q && position<rows.length && !data.searchText.get(rows[position].id)!.includes(q)) position++;
    c.header("Cache-Control","public, max-age=300");
    return c.json({version,items,next_cursor:position<rows.length ? position : null});
});
appsApi.get("/:id", async c => {
    const entry=byId.get(c.req.param("id"));
    if (!entry) return c.json({error:"app_not_found"},404);
    const language=lang(c);
    const englishNotices: Record<string,string> = {
        notion:"Authorize your workspace in the browser. Notion determines permissions, billing, and quotas.",
        github:"Connect with a personal access token. Its permissions and organization policies determine the available resources.",
        "simular-box": "Sign in to Simular in your browser. Watch or take over at box.simular.ai/box. Model calls use account credits. After 14 consecutive days asleep, the computer, files and saves are deleted.",
        runway:"Sign in to Runway in your browser. Generations, retries and regenerations consume credits."
    };
    if (headers(c,version+":"+entry.id+":"+language)) return c.body(null,304);
    const asset = await c.env.ASSETS.fetch(new Request(new URL(`/app-tool-summaries/${entry.id}/${language}.json`, c.req.url)));
    if (!asset.ok && asset.status !== 404) return c.json({error:"tool_summaries_unavailable"},503);
    const tools = asset.ok ? await asset.json<Record<string,string>>() : {};
    return c.json({schema_version:1,app:{...entry,...(language==="en"?{category:groups.find(g=>g[0]===classification.get(entry.id))?.[2] ?? entry.category, notice:englishNotices[entry.id] ?? entry.notice}:{}),description:language==="en"?english[entry.id]??entry.description:entry.description,
        tool_summaries:tools}});
});
