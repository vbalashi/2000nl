import { beforeEach, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/healthSupabase", () => ({
  createHealthSupabaseClient: () => ({ rpc }),
}));
import { readReleaseCatalog, releaseLanguage } from "@/lib/releases/releaseCatalogServer";

beforeEach(() => {
  rpc.mockReset().mockImplementation((_name, args) => ({
    abortSignal: async () => ["en", "ru", "nl"].includes(args.p_locale)
      ? { data: { items: [], nextVersion: null }, error: null }
      : { data: null, error: { code: "22023" } },
  }));
});

test("Ukrainian interface reads the existing English release catalog without changing its UI language", async () => {
  const language = releaseLanguage("uk-UA");
  expect(language).toBe("uk");
  await expect(readReleaseCatalog("0.19.30", language, 10, "0.19.29"))
    .resolves.toEqual({ items: [], nextVersion: null });
  expect(rpc).toHaveBeenCalledWith("read_app_release_notes_v1", {
    p_max_version: "0.19.30", p_locale: "en", p_limit: 10, p_before_version: "0.19.29",
  });
});

test.each(["en", "ru", "nl"])("preserves existing %s release translations", async locale => {
  await readReleaseCatalog("0.19.30", releaseLanguage(locale));
  expect(rpc).toHaveBeenCalledWith("read_app_release_notes_v1", expect.objectContaining({ p_locale: locale }));
});
