export interface Skill {
    id: string;
    name: string;
    description: string;
    version?: string;
    source: {
        type: "zip" | "github";
        repo?: string;
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
        "教会助手如何更好的使用AIPP，包含直接读取和操作 AIPP 数据库的能力、使用AIPP Artifacts 的能力。",
        version: "2026-03-10",
        source: {
            type: "github",
            repo: "xieisabug/AIPP-skills",
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
];
