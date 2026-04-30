export interface PluginSource {
    type: "zip" | "github";
    url?: string;
    repo?: string;
    ref?: string;
}

export interface PluginDir {
    from: string;
    to: string;
}

export interface Plugin {
    id: string;
    code: string;
    name: string;
    description: string;
    version: string;
    author?: string;
    tags?: string[];
    pluginTypes: string[];
    permissions: string[];
    minAippVersion?: string;
    isExperimental?: boolean;
    source: PluginSource;
    dirs: PluginDir[];
    sourceUrl: string;
    sha256: string;
}

const PLUGIN_RELEASE_BASE =
    "https://github.com/xieisabug/AIPP/releases/download/plugins-v0.1.0";
const PLUGIN_SOURCE_BASE = "https://github.com/xieisabug/AIPP/tree/main/plugin";

function makePlugin(params: {
    code: string;
    name: string;
    description: string;
    pluginTypes: string[];
    permissions: string[];
    tags?: string[];
    isExperimental?: boolean;
    version?: string;
    author?: string;
    minAippVersion?: string;
}): Plugin {
    const version = params.version ?? "0.1.0";
    return {
        id: params.code,
        code: params.code,
        name: params.name,
        description: params.description,
        version,
        author: params.author ?? "AIPP",
        tags: params.tags ?? ["official"],
        pluginTypes: params.pluginTypes,
        permissions: params.permissions,
        minAippVersion: params.minAippVersion ?? "0.4.0",
        isExperimental: params.isExperimental ?? false,
        source: {
            type: "zip",
            url: `${PLUGIN_RELEASE_BASE}/${params.code}-${version}.aipp-plugin.zip`,
        },
        dirs: [{ from: params.code, to: params.code }],
        sourceUrl: `${PLUGIN_SOURCE_BASE}/${params.code}`,
        sha256: "sha256:...",
    };
}

export const plugins: Plugin[] = [
    makePlugin({
        code: "directory-bang-plugin",
        name: "Directory Bang Plugin",
        description:
            "Adds !directory and !dir bangs backed by the built-in list_directory tool.",
        pluginTypes: ["toolType", "applicationType"],
        permissions: ["bang.register"],
        tags: ["official", "bang", "tool"],
    }),
    makePlugin({
        code: "run-script-bang-plugin",
        name: "Run Script Bang Plugin",
        description:
            "Adds !run_script, !rs and !bash bangs backed by the built-in execute_bash tool.",
        pluginTypes: ["toolType", "applicationType"],
        permissions: ["bang.register"],
        tags: ["official", "bang", "tool", "high-risk"],
    }),
    makePlugin({
        code: "think-markdown-plugin",
        name: "Think Markdown Plugin",
        description: "Registers a renderer for <think> markdown blocks.",
        pluginTypes: ["markdownType", "interfaceType"],
        permissions: ["markdown.register"],
        tags: ["official", "markdown"],
    }),
    makePlugin({
        code: "hidden-first-turn-context-plugin",
        name: "Hidden First Turn Context Plugin",
        description:
            "为助手配置首轮隐藏上下文，并只在首轮模型请求时注入。",
        pluginTypes: ["applicationType"],
        permissions: [
            "assistant.config",
            "data.read.conversation",
            "hook.chat.beforeModelRequest",
        ],
        tags: ["official", "assistant", "hook"],
    }),
    makePlugin({
        code: "prompt-optimizer-plugin",
        name: "Prompt Optimizer Plugin",
        description:
            "Manual assistant prompt optimizer with model-based review and diff preview.",
        pluginTypes: ["interfaceType"],
        permissions: [
            "assistant.config",
            "conversation.read",
            "assistant.read",
            "assistant.prompt.write",
        ],
        tags: ["official", "assistant", "prompt"],
    }),
    makePlugin({
        code: "usage-dashboard-plugin",
        name: "Usage Dashboard Plugin",
        description:
            "读取本地 conversation / assistant / llm 数据，生成多维度使用统计与趋势图。",
        pluginTypes: ["interfaceType", "applicationType"],
        permissions: [
            "data.read.conversation",
            "data.read.assistant",
            "data.read.llm",
            "plugin.storage",
        ],
        tags: ["official", "dashboard", "analytics"],
    }),
    makePlugin({
        code: "benchmark-plugin",
        name: "Benchmark Plugin",
        description:
            "QA benchmark plugin with dataset management, scoring, and leaderboards.",
        pluginTypes: ["interfaceType", "applicationType"],
        permissions: [],
        tags: ["official", "benchmark", "experimental"],
        isExperimental: true,
    }),
    makePlugin({
        code: "guofeng-zhusha-theme-plugin",
        name: "国风·朱砂 主题插件",
        description: "以朱砂红与象牙白为主色的一键国风主题插件。",
        pluginTypes: ["themeType", "interfaceType", "applicationType"],
        permissions: [],
        tags: ["official", "theme"],
    }),
];
