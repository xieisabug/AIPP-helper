#!/usr/bin/env node
// Copies a `plugins-v*` release produced by AIPP's "Package official plugins" workflow into the helper:
//   - official-plugins.json  -> src/worker/data/official-plugins.json (verbatim, after validation)
//   - plugin-previews/*      -> public/plugin-previews/ (served at /plugin-previews/)
//
// Usage:
//   node scripts/sync-plugin-release.mjs plugins-v0.2.0            # download from the GitHub release
//   node scripts/sync-plugin-release.mjs --from ../../rust/aipp/dist-official-plugins   # local CI output
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const REPOSITORY = "xieisabug/AIPP";
const PREVIEW_PREFIX = "https://aipp-helper.xiejingyang.com/plugin-previews/";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataFile = path.join(root, "src/worker/data/official-plugins.json");
const previewDir = path.join(root, "public/plugin-previews");

const args = process.argv.slice(2);
const fromIndex = args.indexOf("--from");
const localDir = fromIndex >= 0 ? path.resolve(args[fromIndex + 1] ?? "") : null;
const tag = localDir ? null : args[0];
if (!localDir && !/^plugins-v\d/.test(tag ?? "")) {
    console.error("usage: sync-plugin-release.mjs <plugins-vX.Y.Z> | --from <dist-official-plugins>");
    process.exit(1);
}

async function read(name) {
    if (localDir) {
        const candidates = [path.join(localDir, name), path.join(localDir, "plugin-previews", name)];
        for (const file of candidates) {
            try {
                return await fs.readFile(file);
            } catch {
                // try the next location
            }
        }
        throw new Error(`${name} not found under ${localDir}`);
    }
    const url = `https://github.com/${REPOSITORY}/releases/download/${tag}/${name}`;
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) throw new Error(`GET ${url} -> ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
}

function validate(entry) {
    const problems = [];
    if (!/^sha256:[0-9a-f]{64}$/.test(entry.sha256 ?? "")) problems.push("sha256 missing or malformed");
    if (entry.source?.type !== "zip" || !entry.source.url?.includes(`/${entry.code}-${entry.version}.aipp-plugin.zip`)) {
        problems.push("source is not this release's zip");
    }
    if (JSON.stringify(entry.dirs) !== JSON.stringify([{ from: ".", to: entry.code }])) problems.push("dirs must be [{ from: '.', to: code }]");
    for (const url of entry.previewImages ?? []) {
        if (!url.startsWith(PREVIEW_PREFIX) || url.slice(PREVIEW_PREFIX.length).includes("/")) problems.push(`untrusted preview ${url}`);
    }
    if (problems.length) throw new Error(`${entry.code}: ${problems.join("; ")}`);
}

const release = JSON.parse((await read("official-plugins.json")).toString("utf8"));
if (!Array.isArray(release) || release.length === 0) throw new Error("official-plugins.json is empty");
release.forEach(validate);

await fs.mkdir(previewDir, { recursive: true });
let images = 0;
for (const entry of release) {
    for (const url of entry.previewImages ?? []) {
        const name = url.slice(PREVIEW_PREFIX.length);
        await fs.writeFile(path.join(previewDir, name), await read(name));
        images += 1;
    }
}
await fs.writeFile(dataFile, `${JSON.stringify(release, null, 2)}\n`, "utf8");
console.log(`Synced ${release.length} plugins and ${images} preview images from ${tag ?? localDir}`);
for (const entry of release) console.log(`  ${entry.code}@${entry.version} min ${entry.minAippVersion} ${entry.sha256.slice(0, 19)}…`);
