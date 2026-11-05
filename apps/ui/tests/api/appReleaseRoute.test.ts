import { beforeEach, expect, test, vi } from "vitest";
const catalog = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/lib/appVersion", () => ({
  appVersionInfo: () => ({
    version: "0.19.22",
    commit: "a".repeat(40),
    buildTimestamp: "2026-11-05T15:00:00Z",
  }),
}));
vi.mock("@/lib/releases/releaseCatalogServer", () => ({
  readReleaseCatalog: catalog.read,
  releaseLanguage: (v: string) => (v === "ru" || v === "nl" ? v : "en"),
}));
import { GET, dynamic } from "@/app/api/app-release/route";
const note = (version = "0.19.22", summary = "Clearer update notices.") => ({
  id: `release-${version}`,
  version,
  publishedAt: "2026-11-05T15:00:00Z",
  locale: "en",
  title: "Update notices",
  summary,
  details: "",
  revision: 1,
});
beforeEach(() => {
  catalog.read
    .mockReset()
    .mockResolvedValue({ items: [note()], nextVersion: null });
});
test("metadata reads live notes for the exact served version and locale without caching", async () => {
  const response = await GET(
    new Request("http://localhost/api/app-release?language=ru"),
  );
  expect(dynamic).toBe("force-dynamic");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(catalog.read).toHaveBeenCalledWith("0.19.22", "ru");
  const result = await response.json();
  expect(result.build.commit).toBe("a".repeat(40));
  expect(result.announcement.summary).toBe("Clearer update notices.");
  expect(result.history).toHaveLength(1);
  catalog.read.mockResolvedValue({
    items: [note("0.19.22", "Corrected live wording.")],
    nextVersion: null,
  });
  expect((await (await GET(new Request("http://localhost/api/app-release"))).json()).announcement.summary).toBe(
    "Corrected live wording.",
  );
});
test("an older story is kept in history and is never reused as this version's announcement", async () => {
  catalog.read.mockResolvedValue({
    items: [note("0.19.21")],
    nextVersion: null,
  });
  const result = await (await GET(new Request("http://localhost/api/app-release"))).json();
  expect(result.announcement).toBeNull();
  expect(result.history[0].version).toBe("0.19.21");
});
test("editorial storage failure does not hide the real build or block updating", async () => {
  catalog.read.mockRejectedValue(new Error("offline"));
  const result = await (await GET(new Request("http://localhost/api/app-release"))).json();
  expect(result.build.version).toBe("0.19.22");
  expect(result.announcement).toBeNull();
  expect(result.historyStatus).toBe("unavailable");
});
