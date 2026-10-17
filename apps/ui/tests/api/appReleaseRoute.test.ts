import { expect, test, vi } from "vitest";
import announcement from "@/config/release-announcement.json";
vi.mock("@/lib/appVersion", () => ({
  appVersionInfo: () => ({
    version: "1.0",
    commit: "a".repeat(40),
    buildTimestamp: "2026-10-17T08:00:00Z",
  }),
}));
import { GET, dynamic } from "@/app/api/app-release/route";
test("public release metadata is dynamic, uncached and uses existing build identity", async () => {
  const response = GET();
  expect(dynamic).toBe("force-dynamic");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({
    schemaVersion: 1,
    build: {
      version: "1.0",
      commit: "a".repeat(40),
      buildTimestamp: "2026-10-17T08:00:00Z",
    },
    announcement,
  });
});
