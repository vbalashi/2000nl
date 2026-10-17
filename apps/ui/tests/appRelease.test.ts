import { expect, test } from "vitest";
import {
  buildIdentity,
  parseAppRelease,
  releaseUpdateUrl,
} from "@/lib/releases/appRelease";
const build = {
  version: "1.0",
  commit: "a".repeat(40),
  buildTimestamp: "2026-10-17T08:00:00Z",
};
test("release identity detects rebuilds and rollbacks without ordering versions", () => {
  expect(buildIdentity(build)).not.toBe(
    buildIdentity({ ...build, buildTimestamp: "2026-10-18T08:00:00Z" }),
  );
  expect(buildIdentity({ ...build, commit: "dev" })).toBeNull();
  expect(buildIdentity({ ...build, buildTimestamp: "bad" })).toBeNull();
});
test("release schema accepts no news and validates editorial URL and bounded plain text", () => {
  expect(parseAppRelease({ schemaVersion: 1, build }).announcement).toBeNull();
  const announcement = {
    id: "release-1",
    publishedAt: build.buildTimestamp,
    locale: "en",
    title: "Two languages",
    summary: "Short news",
    detailsUrl: "https://example.org/blog",
  };
  expect(
    parseAppRelease({ schemaVersion: 1, build, announcement }).announcement
      ?.detailsUrl,
  ).toBe(announcement.detailsUrl);
  for (const patch of [
    { detailsUrl: "javascript:alert(1)" },
    { detailsUrl: "https://user:pass@example.org/" },
    { title: "x".repeat(101) },
    { summary: "x".repeat(361) },
    { publishedAt: "bad" },
    { locale: "xx" },
  ])
    expect(() =>
      parseAppRelease({
        schemaVersion: 1,
        build,
        announcement: { ...announcement, ...patch },
      }),
    ).toThrow();
  expect(() => parseAppRelease({ schemaVersion: 2, build })).toThrow();
});
test("update navigation preserves destination, query and hash with a single marker", () => {
  const url = new URL(
    releaseUpdateUrl(
      "https://example.org/?destination=settings&word=huis&_appRelease=old#article",
      "new",
    ),
  );
  expect(url.searchParams.get("destination")).toBe("settings");
  expect(url.searchParams.get("word")).toBe("huis");
  expect(url.hash).toBe("#article");
  expect(url.searchParams.getAll("_appRelease")).toEqual(["new"]);
});
