import { isInterfaceLanguage, type InterfaceLanguage } from "@/lib/i18n/registry";
export type ReleaseBuild = {
  version: string;
  commit: string;
  buildTimestamp: string;
};
export type ReleaseAnnouncement = {
  id: string;
  publishedAt: string;
  locale: InterfaceLanguage;
  title: string;
  summary: string;
  detailsUrl?: string;
};
export type AppRelease = {
  schemaVersion: 1;
  build: ReleaseBuild;
  announcement: ReleaseAnnouncement | null;
  history?: ReleaseHistoryEntry[];
  historyStatus?: "ready" | "unavailable";
};
export const RELEASE_MARKER = "_appRelease";
export function buildIdentity(build: ReleaseBuild): string | null {
  return /^[a-f0-9]{40}$/i.test(build.commit) &&
    Number.isFinite(Date.parse(build.buildTimestamp))
    ? `${build.commit}:${build.buildTimestamp}`
    : null;
}
function text(v: unknown, max: number): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.length <= max;
}
export type ReleaseHistoryEntry = ReleaseAnnouncement & {
  version: string;
  details: string;
  revision: number;
};
export type ReleaseCatalog = {
  items: ReleaseHistoryEntry[];
  nextVersion: string | null;
};
export const releaseVersionPattern =
  /^(0|[1-9][0-9]{0,7})\.(0|[1-9][0-9]{0,7})\.(0|[1-9][0-9]{0,7})$/;
function parseAnnouncement(value: unknown): ReleaseAnnouncement {
  const a = value as ReleaseAnnouncement | null;
  if (
    !a ||
    !text(a.id, 100) ||
    !text(a.title, 100) ||
    !text(a.summary, 360) ||
    !isInterfaceLanguage(a.locale) ||
    !Number.isFinite(Date.parse(a.publishedAt))
  )
    throw new Error("Invalid release announcement");
  if (a.detailsUrl !== undefined) {
    if (!text(a.detailsUrl, 2048)) throw new Error("Invalid release URL");
    const url = new URL(a.detailsUrl);
    if (url.protocol !== "https:" || url.username || url.password)
      throw new Error("Invalid release URL");
  }
  return {
    id: a.id,
    publishedAt: a.publishedAt,
    locale: a.locale,
    title: a.title,
    summary: a.summary,
    ...(a.detailsUrl ? { detailsUrl: a.detailsUrl } : {}),
  };
}
export function parseReleaseCatalog(value: unknown): ReleaseCatalog {
  const v = value as ReleaseCatalog | null;
  if (
    !v ||
    !Array.isArray(v.items) ||
    v.items.length > 50 ||
    (v.nextVersion !== null &&
      (typeof v.nextVersion !== "string" ||
        !releaseVersionPattern.test(v.nextVersion)))
  )
    throw new Error("Invalid release catalog");
  const versions = new Set<string>();
  const items = v.items.map((item) => {
    const announcement = parseAnnouncement(item);
    if (
      !releaseVersionPattern.test(item.version) ||
      versions.has(item.version) ||
      typeof item.details !== "string" ||
      item.details.length > 6000 ||
      !Number.isSafeInteger(item.revision) ||
      item.revision < 1
    )
      throw new Error("Invalid release history entry");
    versions.add(item.version);
    return {
      ...announcement,
      version: item.version,
      details: item.details,
      revision: item.revision,
    };
  });
  return { items, nextVersion: v.nextVersion };
}
export function parseAppRelease(value: unknown): AppRelease {
  const v = value as Partial<AppRelease> | null;
  if (
    !v ||
    v.schemaVersion !== 1 ||
    !v.build ||
    !text(v.build.version, 100) ||
    !text(v.build.commit, 100) ||
    typeof v.build.buildTimestamp !== "string"
  )
    throw new Error("Invalid release metadata");
  if (
    v.historyStatus !== undefined &&
    v.historyStatus !== "ready" &&
    v.historyStatus !== "unavailable"
  )
    throw new Error("Invalid release history status");
  const build = {
    version: v.build.version,
    commit: v.build.commit,
    buildTimestamp: v.build.buildTimestamp,
  };
  return {
    schemaVersion: 1,
    build,
    announcement:
      v.announcement == null ? null : parseAnnouncement(v.announcement),
    ...(v.history === undefined
      ? {}
      : {
          history: parseReleaseCatalog({ items: v.history, nextVersion: null })
            .items,
        }),
    ...(v.historyStatus === undefined
      ? {}
      : { historyStatus: v.historyStatus }),
  };
}
export function releaseUpdateUrl(current: string, target: string) {
  const url = new URL(current);
  url.searchParams.set(RELEASE_MARKER, target);
  return url.href;
}
