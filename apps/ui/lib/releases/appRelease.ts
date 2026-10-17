export type ReleaseBuild = {
  version: string;
  commit: string;
  buildTimestamp: string;
};
export type ReleaseAnnouncement = {
  id: string;
  publishedAt: string;
  locale: "en" | "ru" | "nl";
  title: string;
  summary: string;
  detailsUrl?: string;
};
export type AppRelease = {
  schemaVersion: 1;
  build: ReleaseBuild;
  announcement: ReleaseAnnouncement | null;
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
  const build = {
    version: v.build.version,
    commit: v.build.commit,
    buildTimestamp: v.build.buildTimestamp,
  };
  if (v.announcement == null)
    return { schemaVersion: 1, build, announcement: null };
  const a = v.announcement;
  if (
    !text(a.id, 100) ||
    !text(a.title, 100) ||
    !text(a.summary, 360) ||
    !["en", "ru", "nl"].includes(a.locale) ||
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
    schemaVersion: 1,
    build,
    announcement: {
      id: a.id,
      publishedAt: a.publishedAt,
      locale: a.locale,
      title: a.title,
      summary: a.summary,
      ...(a.detailsUrl ? { detailsUrl: a.detailsUrl } : {}),
    },
  };
}
export function releaseUpdateUrl(current: string, target: string) {
  const url = new URL(current);
  url.searchParams.set(RELEASE_MARKER, target);
  return url.href;
}
