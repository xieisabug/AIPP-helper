import { Hono } from "hono";
import { skills } from "./data/skills";
import { plugins } from "./data/plugins";
import { AIPP_VERSION_HEADER, pluginsForClient, resolveClientVersion } from "./plugin-version";
import { appsApi } from "./apps";
import { agentPluginsApi } from "./agent-plugins";

type AppEnv = {
	Bindings: Env & {
		ASSETS: Fetcher;
	};
};

const app = new Hono<AppEnv>();

// API 路由
app.get("/api/", (c) => c.json({ name: "Cloudflare" }));
app.get("/api/skills", (c) => c.json(skills));
// Hide plugins the requesting client cannot install (minAippVersion newer than the client).
// `?aippVersion=` overrides the header, which helps when inspecting the list in a browser.
app.get("/api/plugins", (c) => {
	const clientVersion = resolveClientVersion(c.req.query("aippVersion") ?? c.req.header(AIPP_VERSION_HEADER));
	c.header("Vary", AIPP_VERSION_HEADER);
	return c.json(pluginsForClient(plugins, clientVersion));
});
app.route("/api/apps", appsApi);
app.route("/api/agent-plugins", agentPluginsApi);

// SPA fallback - 其他所有路由返回 index.html
app.all("*", async (c) => {
	const url = new URL("/index.html", c.req.url);
	return c.env.ASSETS.fetch(url);
});

export default app;
