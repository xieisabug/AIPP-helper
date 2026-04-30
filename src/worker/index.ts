import { Hono } from "hono";
import { skills } from "./data/skills";
import { plugins } from "./data/plugins";

type AppEnv = {
	Bindings: Env & {
		ASSETS: Fetcher;
	};
};

const app = new Hono<AppEnv>();

// API 路由
app.get("/api/", (c) => c.json({ name: "Cloudflare" }));
app.get("/api/skills", (c) => c.json(skills));
app.get("/api/plugins", (c) => c.json(plugins));

// SPA fallback - 其他所有路由返回 index.html
app.all("*", async (c) => {
	const url = new URL("/index.html", c.req.url);
	return c.env.ASSETS.fetch(url);
});

export default app;
