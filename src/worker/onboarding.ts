import preset from "./data/onboarding.json";
import external from "./data/onboarding-benchmarks.json";

type CatalogModel = { canonical_model_id?: string; type?: string; tool_call?: boolean; provider?: { api?: string }; cost?: { input?: number; output?: number }; id?: string; name?: string; family?: string; release_date?: string; modalities?: { output?: string[] }; base_model?: string | { id?: string }; limit?: { context?: number; input?: number; output?: number } };
type Catalog = Record<string, { api?: string; models?: Record<string, CatalogModel> }>;

function positiveLimit(value?: number): value is number {
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function withModelAliases(catalog: Catalog) {
    const limits: Record<string, { context?: number; output?: number }> = { ...preset.model_limits };
    const rows = [...preset.model_ranking.main, ...preset.model_ranking.light];
    const aliases = new Map(rows.map(row => [row.base, new Set(row.aliases)]));
    const owners = new Map<string, Set<string>>();
    const normalized = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");
    const index = (name: string | undefined, base: string) => {
        if (!name) return;
        const key = normalized(name);
        const bases = owners.get(key) ?? new Set<string>();
        bases.add(base);
        owners.set(key, bases);
    };
    for (const {base, aliases: manual} of rows) {
        const [vendor, ...parts] = base.split("/");
        const id = parts.join("/");
        index(base, base);
        index(id, base);
        for (const alias of manual) index(alias, base);
        index(catalog[vendor]?.models?.[id]?.name, base);
    }
    for (const [provider, entry] of Object.entries(catalog)) {
        for (const [id, model] of Object.entries(entry?.models ?? {})) {
            if (!model) continue;
            if (model.limit) {
                const key = provider + "/" + (model.id || id);
                const capacity = { ...limits[key] };
                const { context, input, output } = model.limit;
                if (positiveLimit(context)) capacity.context = context;
                if (positiveLimit(input)) capacity.context = Math.min(capacity.context ?? input, input);
                if (positiveLimit(output)) capacity.output = output;
                if (capacity.context || capacity.output) limits[key] = capacity;
            }
            const explicit = typeof model.base_model === "string" ? model.base_model : model.base_model?.id;
            if (explicit) {
                aliases.get(explicit)?.add(model.id || id);
                continue;
            }
            // The public catalogue also contains rows without base_model. Only accept an
            // exact official id or display name with a single owner in the curated list.
            const matched = new Set<string>();
            for (const key of [`${provider}/${id}`, id, model.id, model.name]) {
                if (key) for (const base of owners.get(normalized(key)) ?? []) matched.add(base);
            }
            if (matched.size === 1) {
                const [base] = matched;
                aliases.get(base)?.add(model.id || id);
            }
        }
    }
    const preferred = preset.recommended_provider;
    const family = preferred.preferred_family;
    const familyModels = Object.entries(catalog[preferred.api_type]?.models ?? {})
        .filter(([id, model]) => {
            const terms = [id, model.family, model.name].join(" ").toLowerCase().split(/[^a-z0-9]+/);
            return terms.includes(family) && !["exp", "experimental", "preview", "embedding"].some(term => terms.includes(term)) &&
                (!model.modalities?.output || model.modalities.output.includes("text"));
        })
        .sort(([left, a], [right, b]) =>
            Number(right === preferred.models.main) - Number(left === preferred.models.main) ||
            (b.release_date ?? "").localeCompare(a.release_date ?? "") || left.localeCompare(right))
        .map(([id, model]) => model.id || id);
    const familyBase = preferred.api_type + "/" + preferred.models.main;
    for (const code of familyModels) aliases.get(familyBase)?.add(code);
    const preferredCode = familyModels[0];
    const recommended = preferredCode
        ? { ...preferred, models: { main: preferredCode, light: preferredCode, review: preferredCode } }
        : preferred;
    const expand = (ranking: typeof preset.model_ranking.main) => ranking.map(item => ({
        ...item, aliases: [...(aliases.get(item.base) ?? item.aliases)],
    }));
    return { ...preset, recommended_provider: recommended, model_limits: limits, model_ranking: { main: expand(preset.model_ranking.main), light: expand(preset.model_ranking.light) } };
}

type Benchmark = { name: string; score: number; metric?: string; dataset?: string; version?: string; harness?: string; variant?: string };
type ModelCatalog = { providers: Catalog; models: Record<string, { name?: string; family?: string; release_date?: string; benchmarks?: Benchmark[] }> };

const officialEndpoints: Record<string, string[]> = {
    openai: ["https://api.openai.com/v1"], anthropic: ["https://api.anthropic.com", "https://api.anthropic.com/v1"],
    google: ["https://generativelanguage.googleapis.com/v1beta"], deepseek: ["https://api.deepseek.com/v1"],
    cohere: ["https://api.cohere.ai/v1"],
};

// Each comparison keeps its metric, direction and test conditions.
const groups: Record<string, string> = {
    "gpqa diamond": "reasoning", "humanity's last exam": "reasoning", "mmlu-pro": "reasoning",
    "terminal-bench": "agent", "swe-bench verified": "agent", "swe-bench pro": "agent",
    "agents' last exam": "agent", "mcp atlas": "agent", "automationbench": "agent",
    "toolathlon": "agent", "toolathlon-verified": "agent", "deepswe": "agent",
    "ifeval": "instruction", "ifbench": "instruction", "longbench": "context", "mrcr": "context",
    "simpleqa-verified": "factual", "chinese simpleqa": "factual",
    "harmbench": "safety", "xstest": "safety", "wildguardtest": "safety",
};
function benchmarkRows(rows: Benchmark[], independent: ExternalRow[]) {
    const unique = new Map<string, ExternalRow>();
    for (const row of rows) {
        const clean = (value?: string) => (value ?? "").trim().toLowerCase();
        const name = clean(row.name);
        const metric = clean(row.metric) || "score";
        const variant = clean(row.variant);
        const effort = ["low","medium","high","xhigh","max","minimal","none"].includes(variant) ? variant : undefined;
        if (name === "artificial analysis intelligence index" && row.version && Number.isFinite(row.score)) {
            // Release metadata can quote AA directly. Prefer the original for the same version/effort.
            const version = clean(row.version).replace(/^v/, "");
            const test = "aa:intelligence:" + version;
            if (!independent.some(b => b.test === test && b.effort === effort))
                unique.set(test + "/" + variant, {group: "reasoning", test, score: row.score, effort, tolerance: 2});
            continue;
        }
        if (name === "aa-3d" && metric === "elo" && Number.isFinite(row.score)) {
            unique.set(name, {group: "visual3d", test: JSON.stringify([name, metric, row.version ?? "", variant]), score: row.score});
            continue;
        }
        const rejection = name === "harmbench" && metric === "attack success rate";
        const falseAllow = metric === "false allow rate" && ["tool approval", "tool safety review"].includes(name);
        const group = falseAllow ? "unsafeAllowance" : groups[name];
        if (!group || !Number.isFinite(row.score) || row.score < 0 || row.score > 100) continue;
        if (!rejection && !falseAllow && !["score", "accuracy", "percent", "%", "pass@1", "resolved", "resolve rate", "percent resolved",
            "success rate", "pass rate", "strict pass@1", "f1", "balanced accuracy"].includes(metric)) continue;
        // A generic safety score can measure attack success (lower is better).
        if (group === "safety" && !rejection && !["accuracy", "balanced accuracy", "f1"].includes(metric)) continue;
        const test = JSON.stringify([name, metric, ...[row.version, row.dataset, row.variant, row.harness].map(clean)]);
        const prior = unique.get(test);
        const lowerBetter = rejection || falseAllow;
        if (!prior || (lowerBetter ? prior.score < row.score : prior.score > row.score)) unique.set(test, {group, test, score: row.score,
            ...(lowerBetter && {lowerBetter: true}),
            ...(effort && {effort})});
    }
    return [...unique.values()];
}

type ExternalRow = {group: string; test: string; score: number; low?: number; high?: number; effort?: string; tolerance?: number; lowerBetter?: boolean};
type ExternalCatalog = {benchmarks: Record<string, ExternalRow[]>; defaults: Record<string, string>};

export function recommendationCatalog({models, providers}: ModelCatalog, supplement: ExternalCatalog = external) {
    if (!models || !providers) throw new Error("models.dev catalog is missing models or providers");
    const benchmarks: Record<string, ExternalRow[]> = {};
    const independent: Record<string, ExternalRow[]> = {};
    for (const [id, model] of Object.entries(models)) {
        const measured = supplement.benchmarks[id] ?? [];
        for (const row of benchmarkRows(model.benchmarks ?? [], measured)) {
            // Previous clients only understand unqualified, higher-is-better percentages.
            const target = row.lowerBetter || row.effort || row.test.startsWith("aa:") || row.group === "visual3d"
                ? independent : benchmarks;
            (target[id] ??= []).push(row);
        }
        if (measured.length) (independent[id] ??= []).push(...measured);
    }
    const offers = Object.fromEntries(Object.entries(providers).map(([id, p]) => {
        const endpoints = [...new Set([...(officialEndpoints[id] ?? []), ...(p.api ? [p.api] : [])])];
        const entries = Object.fromEntries(Object.entries(p.models ?? {}).map(([code, m]) => {
            const model = m.canonical_model_id ?? (Object.hasOwn(models, id + "/" + code) ? id + "/" + code : undefined);
            return [code, { model, input: m.cost?.input, output: m.cost?.output, tools: m.tool_call,
                chat: (!m.type || m.type === "chat") && (!m.modalities?.output || m.modalities.output.includes("text")),
                endpoint: m.provider?.api }];
        }));
        return [id, {endpoints, models: entries}];
    }));
    const identities = Object.fromEntries(Object.entries(models).map(([id, model]) => [id, {
        family: model.family, date: model.release_date, effort: supplement.defaults[id],
    }]));
    return { benchmarks, independent_benchmarks: independent, providers: offers, identities, scoring_version: 2, sources: external.sources };
}
const aliasCacheKey = "https://aipp-helper.xiejingyang.com/api/onboarding/aliases/v2/" + preset.revision;

export async function refreshAliases(): Promise<Response> {
    const upstream = await fetch("https://models.dev/catalog.json", { signal: AbortSignal.timeout(8000) });
    if (!upstream.ok) throw new Error(`models.dev HTTP ${upstream.status}`);
    const catalog = await upstream.json() as ModelCatalog;
    const enriched = { ...withModelAliases(catalog.providers), recommendation_catalog: recommendationCatalog(catalog) };
    const response = Response.json(enriched, { headers: { "Cache-Control": "public, max-age=86400" } });
    await caches.default.put(aliasCacheKey, response.clone());
    return response;
}

export async function getPreset() {
    const cached = await caches.default.match(aliasCacheKey);
    if (cached) return cached;
    try {
        return await refreshAliases();
    } catch (error) {
        console.warn("Onboarding alias refresh failed", String(error));
        return Response.json(preset, { headers: { "Cache-Control": "public, max-age=300" } });
    }
}

export { preset };
