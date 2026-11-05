import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Pool, type PoolClient } from "pg";
import { getDbUrl, runMigrations, withTransaction } from "./dbTestUtils";
const url = getDbUrl();
const translations = (summary = "Short release notes.") =>
  Object.fromEntries(
    ["en", "nl", "ru"].map((locale) => [
      locale,
      { title: "A clearer app", summary, details: "More information." },
    ]),
  );
async function write(
  c: PoolClient,
  version = "0.19.22",
  summary = "Short release notes.",
  revision: number | null = null,
  createOnly = false,
  commit = "a".repeat(40),
) {
  return (
    await c.query(
      "select public.write_app_release_notes_v1($1,$2,$3,$4,$5,$6) result",
      [
        version,
        commit,
        "2026-01-01T00:00:00Z",
        translations(summary),
        revision,
        createOnly,
      ],
    )
  ).rows[0].result;
}
async function read(
  c: PoolClient,
  version = "0.19.22",
  locale = "en",
  limit = 5,
  before: string | null = null,
) {
  return (
    await c.query(
      "select public.read_app_release_notes_v1($1,$2,$3,$4) result",
      [version, locale, limit, before],
    )
  ).rows[0].result;
}
describe.skipIf(!url)("editable version-bound release notes", () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    await runMigrations(pool);
  }, 120000);
  afterAll(async () => pool?.end());
  test("API principals cannot access tables or call editorial/read RPCs directly", async () =>
    withTransaction(pool, async (c) => {
      for (const role of ["anon", "authenticated"])
        for (const fn of [
          "public.read_app_release_notes_v1(text,text,integer,text)",
          "public.write_app_release_notes_v1(text,text,timestamptz,jsonb,integer,boolean)",
          "public.read_app_release_notes_editor_v1(text)",
        ])
          expect(
            (
              await c.query(
                "select has_function_privilege($1,$2,'execute') allowed",
                [role, fn],
              )
            ).rows[0].allowed,
          ).toBe(false);
      expect(
        (
          await c.query(
            "select has_table_privilege('service_role','private.app_release_notes','select') allowed",
          )
        ).rows[0].allowed,
      ).toBe(false);
    }));
  test("service publication is localized and immediately correctable without a build change", async () =>
    withTransaction(pool, async (c) => {
      await c.query("set local role service_role");
      expect((await write(c)).revision).toBe(1);
      expect((await read(c, "0.19.22", "ru")).items[0]).toMatchObject({
        id: "release-0.19.22",
        version: "0.19.22",
        locale: "ru",
        summary: "Short release notes.",
      });
      expect((await write(c, "0.19.22", "Corrected text.", 1)).revision).toBe(
        2,
      );
      expect((await read(c)).items[0]).toMatchObject({
        id: "release-0.19.22",
        revision: 2,
        summary: "Corrected text.",
      });
    }));
  test("redeploy does not overwrite an editorial correction and stale editors are rejected", async () =>
    withTransaction(pool, async (c) => {
      await write(c);
      await write(c, "0.19.22", "Corrected text.", 1);
      await write(c, "0.19.22", "Original draft.", null, true);
      expect((await read(c)).items[0].summary).toBe("Corrected text.");
      await c.query("savepoint stale");
      await expect(write(c, "0.19.22", "Stale edit.", 1)).rejects.toThrow(
        "revision_conflict",
      );
      await c.query("rollback to savepoint stale");
      expect((await read(c)).items[0].revision).toBe(2);
    }));
  test("version ordering, older pages and rollback bounds never expose a future release", async () =>
    withTransaction(pool, async (c) => {
      for (const version of [
        "0.19.9",
        "0.19.10",
        "0.19.20",
        "0.19.21",
        "0.19.22",
      ])
        await write(c, version);
      const current = await read(c, "0.19.21", "en", 2);
      expect(current.items.map((x: any) => x.version)).toEqual([
        "0.19.21",
        "0.19.20",
      ]);
      expect(current.nextVersion).toBe("0.19.20");
      expect(
        (await read(c, "0.19.21", "en", 2, current.nextVersion)).items.map(
          (x: any) => x.version,
        ),
      ).toEqual(["0.19.10", "0.19.9"]);
    }));
  test("the same version cannot be rebound to a different application commit", async () =>
    withTransaction(pool, async (c) => {
      await write(c);
      await c.query("savepoint conflict");
      await expect(
        write(c, "0.19.22", "Other build.", null, true, "b".repeat(40)),
      ).rejects.toThrow("commit_conflict");
      await c.query("rollback to savepoint conflict");
      const edited = (
        await c.query(
          "select public.read_app_release_notes_editor_v1('0.19.22') result",
        )
      ).rows[0].result;
      expect(edited.commit).toBe("a".repeat(40));
      expect(Object.keys(edited.translations).sort()).toEqual([
        "en",
        "nl",
        "ru",
      ]);
    }));
  test("incomplete, oversized and unsafe editorial inputs fail atomically", async () =>
    withTransaction(pool, async (c) => {
      await write(c);
      for (const bad of [
        { en: { title: "Incomplete", summary: "One locale" } },
        translations("x".repeat(241)),
        {
          ...translations(),
          en: {
            title: "Bad link",
            summary: "A note.",
            detailsUrl: "https://user:pass@example.org/",
          },
        },
      ]) {
        await c.query("savepoint invalid");
        await expect(
          c.query(
            "select public.write_app_release_notes_v1('0.19.22',$1,now(),$2,1,false)",
            ["a".repeat(40), bad],
          ),
        ).rejects.toThrow();
        await c.query("rollback to savepoint invalid");
      }
      expect((await read(c)).items[0].revision).toBe(1);
    }));
});
