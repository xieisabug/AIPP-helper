export interface Skill {
    id: string;
    name: string;
    description: string;
    version?: string;
    source: {
        type: "zip" | "github";
        repo?: string;
        ref?: string;
        url?: string;
    };
    dirs?: {
        from: string;
        to: string;
    }[];
}

export const skills: Skill[] = [
    {
        id: "aipp-skills",
        name: "AIPP Skills",
        description:
            "教会助手更好地使用 AIPP：构建 Artifact、查询与维护 AIPP 数据、开发 AIPP 插件，以及在管家模式下通过 SuperAdmin 管理助手、模型、MCP、Skills 与定时任务。",
        version: "2026-11-26",
        source: {
            type: "github",
            repo: "xieisabug/AIPP-skills",
        },
    },
    {
        id: "vercel-labs-skills-find-skills",
        name: "Vercel Labs find-skills",
        description: "Vercel 官方维护的skills商店，内置find-skills的技能。",
        version: "2026-03-10",
        source: {
            type: "github",
            repo: "vercel-labs/skills",
        },
    },
    {
        id: "anthropics-skills",
        name: "Anthropics Skills",
        description: "Anthropics 官方维护的skills商店，内置多个技能。",
        version: "2026-03-10",
        source: {
            type: "github",
            repo: "anthropics/skills",
        },
    },
    {
        id: "vercel-labs-agent-skills",
        name: "Vercel Labs agent-skills",
        description: "Vercel 官方维护的agent-skills商店，内置多个技能。",
        version: "2026-03-10",
        source: {
            type: "github",
            repo: "vercel-labs/agent-skills",
        },
    },
    {
        id: "remotion-dev-skills",
        name: "Remotion Skills",
        description: "Remotion 是一个知名的 React 视频制作框架，允许开发者用 React 代码创建视频。Remotion 官方正在开发的 AI Agent Skills",
        version: "2026-03-10",
        source: {
            type: "github",
            repo: "remotion-dev/skills",
        },
    },
    {
        id: "taste-skill",
        name: "Taste Skill",
        description: `Taste-Skill (High-Agency Frontend) - gives your AI good taste. stops the AI from generating boring, generic, "slop"`,
        version: "2026-03-10",
        source: {
            type: "github",
            repo: "Leonxlnx/taste-skill",
        },
    },
];
