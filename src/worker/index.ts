import { Hono } from "hono";
import { skills } from "./data/skills";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/", (c) => c.json({ name: "Cloudflare" }));

app.get("/api/skills", (c) => c.json(skills));

export default app;
