import { access, readFile } from "node:fs/promises";
import { beforeEach, expect, it, vi } from "vitest";
import { hasUnifiedAdminArtifact } from "@/lib/admin/unifiedArtifact";

vi.mock("server-only", () => ({}));
vi.mock("node:fs/promises", () => {
  const methods = { access: vi.fn(), readFile: vi.fn() };
  return { ...methods, default: methods };
});

beforeEach(() => {
  vi.mocked(access).mockResolvedValue(undefined);
  vi.mocked(readFile).mockResolvedValue("2000nl-admin-routes-v1\n");
});

it("recognizes the version marker and entry point from the same artifact", async () => {
  expect(await hasUnifiedAdminArtifact()).toBe(true);
  expect(readFile).toHaveBeenCalledWith(expect.stringMatching(/public[/\\]admin[/\\]reports[/\\]assets[/\\]admin-unified-v1.txt$/), "utf8");
  expect(access).toHaveBeenCalledWith(expect.stringMatching(/public[/\\]admin[/\\]reports[/\\]index.html$/));
});

it("keeps legacy routes when the artifact is missing or incompatible", async () => {
  vi.mocked(readFile).mockResolvedValueOnce("unexpected version");
  expect(await hasUnifiedAdminArtifact()).toBe(false);
  vi.mocked(readFile).mockRejectedValueOnce(new Error("marker missing"));
  expect(await hasUnifiedAdminArtifact()).toBe(false);
  vi.mocked(access).mockRejectedValueOnce(new Error("entry point missing"));
  expect(await hasUnifiedAdminArtifact()).toBe(false);
});
