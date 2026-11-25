import type { Plugin } from "./data/plugins";

/** AIPP clients send their version in this header (since 1.6.2). */
export const AIPP_VERSION_HEADER = "X-AIPP-Version";

/**
 * Requests without the header come from clients between 1.2.0 (the first with the official plugin
 * list) and 1.6.1 (the last without the header). We cannot tell them apart, so assume the oldest:
 * a plugin listed for them must install and run on every one of those versions.
 */
export const LEGACY_CLIENT_VERSION = "1.2.0";

type Version = [number, number, number];

/** Parses `major.minor.patch`, ignoring a leading `v` and any `-prerelease`/`+build` suffix. */
export function parseVersion(raw: string | null | undefined): Version | null {
    const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec((raw ?? "").trim());
    if (!match) return null;
    return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareVersions(a: Version, b: Version): number {
    for (let i = 0; i < 3; i++) {
        if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
}

/** Resolves the client version; a missing or malformed value means a legacy client. */
export function resolveClientVersion(raw: string | null | undefined): Version {
    return parseVersion(raw) ?? (parseVersion(LEGACY_CLIENT_VERSION) as Version);
}

function canInstall(plugin: Plugin, clientVersion: Version): boolean {
    const min = parseVersion(plugin.minAippVersion);
    return !min || compareVersions(min, clientVersion) <= 0;
}

/**
 * For each plugin code, keeps the newest release whose `minAippVersion` is absent, unparseable,
 * or not newer than the client. Older clients keep getting the last release they can run instead
 * of losing the plugin; a code with no compatible release is hidden.
 * Order follows the first release of each code in `all`.
 */
export function pluginsForClient(all: Plugin[], clientVersion: Version): Plugin[] {
    const chosen = new Map<string, Plugin | undefined>();
    for (const plugin of all) {
        if (!chosen.has(plugin.code)) chosen.set(plugin.code, undefined);
        if (!canInstall(plugin, clientVersion)) continue;
        const current = chosen.get(plugin.code);
        const version = parseVersion(plugin.version) ?? [0, 0, 0];
        if (!current || compareVersions(version, parseVersion(current.version) ?? [0, 0, 0]) > 0) {
            chosen.set(plugin.code, plugin);
        }
    }
    return [...chosen.values()].filter((plugin): plugin is Plugin => !!plugin);
}
