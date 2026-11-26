import { readFile, writeFile } from "node:fs/promises";
import { build } from "esbuild";

// Use the worker's catalog builder for the desktop offline copy as well.
const [input, output] = process.argv.slice(2);
const bundle = await build({entryPoints: ["src/worker/onboarding.ts"], bundle: true, platform: "node", format: "esm", write: false});
const url = "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].contents).toString("base64");
const { recommendationCatalog } = await import(url);
const catalog = recommendationCatalog(JSON.parse(await readFile(input, "utf8")));
await writeFile(output, JSON.stringify(catalog) + "\n");
