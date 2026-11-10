import { Hono } from "hono";
import catalog from "./data/apps.json";

// A versioned catalog, independent of the existing Skills and plugin package APIs.
export const appsApi = new Hono();
appsApi.get("/", (c) => {
    c.header("Cache-Control", "public, max-age=300");
    c.header("ETag", `"apps-${catalog.version}"`);
    if (c.req.header("If-None-Match") === `"apps-${catalog.version}"`) return c.body(null, 304);
    return c.json(catalog);
});
appsApi.get("/:id", (c) => {
    const entry = catalog.apps.find(app => app.id === c.req.param("id"));
    if (!entry) return c.json({ error: "app_not_found" }, 404);
    return c.json({ schema_version: catalog.schema_version, app: entry });
});
