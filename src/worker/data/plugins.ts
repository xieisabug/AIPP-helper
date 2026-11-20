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

const PLUGIN_RELEASE_DOWNLOAD = "https://github.com/xieisabug/AIPP/releases/download";
const DEFAULT_PLUGIN_RELEASE_TAG = "plugins-v0.1.0";
const PLUGIN_SOURCE_BASE = "https://github.com/xieisabug/AIPP/tree/main/plugin";

function makePlugin(params: {
    code: string;
    name: string;
    description: string;
    pluginTypes: string[];
    permissions: string[];
    sha256: string;
    tags?: string[];
    isExperimental?: boolean;
    version?: string;
    author?: string;
    minAippVersion?: string;
    /** GitHub release tag hosting the zip; single-plugin releases use `plugin-<code>-v<version>`. */
    releaseTag?: string;
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
            url: `${PLUGIN_RELEASE_DOWNLOAD}/${params.releaseTag ?? DEFAULT_PLUGIN_RELEASE_TAG}/${params.code}-${version}.aipp-plugin.zip`,
        },
        // Zips hold a single top-level `<code>/` folder that the AIPP installer strips,
        // so the plugin lives at the archive root.
        dirs: [{ from: ".", to: params.code }],
        sourceUrl: `${PLUGIN_SOURCE_BASE}/${params.code}`,
        sha256: params.sha256,
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
        sha256:
            "sha256:fcb18fcab2475a18aebda48440faa5ab6de066e3720c956a4a53774267aee3c0",
    }),
    makePlugin({
        code: "run-script-bang-plugin",
        name: "Run Script Bang Plugin",
        description:
            "Adds !run_script, !rs and !bash bangs backed by the built-in execute_bash tool.",
        pluginTypes: ["toolType", "applicationType"],
        permissions: ["bang.register"],
        tags: ["official", "bang", "tool", "high-risk"],
        sha256:
            "sha256:6c70073de669f63f44ae3a17e1c4f32a72e4db9873435d27ad4a48bd523e54ee",
    }),
    makePlugin({
        code: "think-markdown-plugin",
        name: "Think Markdown Plugin",
        description: "Registers a renderer for <think> markdown blocks.",
        pluginTypes: ["markdownType", "interfaceType"],
        permissions: ["markdown.register"],
        tags: ["official", "markdown"],
        sha256:
            "sha256:43057855ef04cee4ee88d91ef75ecdd13f45c11283a6c7b823bbbc976b9a9281",
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
        sha256:
            "sha256:abd92b54b46173d1d720e3150250b40b62798158d5e4f599af1e1c74a6a5ee84",
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
        sha256:
            "sha256:442192c040c034048f2401013c137283fc9c769bbcd14c28eee1a610e040716e",
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
        sha256:
            "sha256:e4eec3cec7adeb35874f30a93aab277ef0c9ec08f33269f38d37e18a5ecff427",
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
        sha256:
            "sha256:09e62ae253798bc1f02e74b8800e332a2f3cecb81cb9b520f1b42dcfaad181f0",
    }),
    makePlugin({
        code: "guofeng-zhusha-theme-plugin",
        name: "国风·朱砂 主题插件",
        description: "以朱砂红与象牙白为主色的一键国风主题插件。",
        pluginTypes: ["themeType", "interfaceType", "applicationType"],
        permissions: [],
        tags: ["official", "theme"],
        sha256:
            "sha256:e202fd12fd4032fb9c77b42be678878f4cfbf30d9c5be3b3e82ef39f85f54532",
    }),
    makePlugin({
        code: "office-preview-plugin",
        name: "Office 文档预览",
        description:
            "在 AIPP 内只读预览 Word (.docx)、Excel (.xlsx)、PowerPoint (.pptx)，基于 BetterOffice 本地离线渲染，内置简中与拉丁开源字体，文档不上传。",
        pluginTypes: ["interfaceType"],
        permissions: [],
        tags: ["official", "interface", "office", "preview"],
        minAippVersion: "1.6.2",
        version: "0.1.1",
        releaseTag: "plugin-office-preview-plugin-v0.1.1",
        sha256:
            "sha256:a0a1abd13db647a316d441d52d51c5ed625e723ae7ff3dd8a8c624ba568a552b",
    }),
];
