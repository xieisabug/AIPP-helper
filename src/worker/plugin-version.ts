import type { Plugin } from "./data/plugins";

/** AIPP clients send their version in this header (since 1.6.2). */
export const AIPP_VERSION_HEADER = "X-AIPP-Version";

/**
 * Requests without the header come from clients that predate it, i.e. 1.6.1 or older.
 * Treating them as 1.6.1 hides plugins they cannot install.
 */
export const LEGACY_CLIENT_VERSION = "1.6.1";

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

/** Keeps plugins whose `minAippVersion` is absent, unparseable, or not newer than the client. */
export function pluginsForClient(all: Plugin[], clientVersion: Version): Plugin[] {
    return all.filter((plugin) => {
        const min = parseVersion(plugin.minAippVersion);
        return !min || compareVersions(min, clientVersion) <= 0;
    });
}
