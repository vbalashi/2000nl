import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  ensureUserWithSettings,
  getDbUrl,
  insertWord,
  runMigrations,
  withTransaction,
} from "./dbTestUtils";
const dbUrl = getDbUrl(),
  now = "2026-10-03T12:00:00.000Z";
async function owner(c: PoolClient) {
  const u = randomUUID();
  await ensureUserWithSettings(c, u);
  await c.query(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','service_role',true),set_config('training.test_reference_now',$2,true)",
    [u, now],
  );
  await c.query(
    "update user_settings set training_schedule_timezone='Europe/Amsterdam' where user_id=$1",
    [u],
  );
  return u;
}
async function card(
  c: PoolClient,
  u: string,
  due: string,
  mode = "word-to-definition",
  entry?: string,
  reps = 2,
) {
  const e = entry ?? (await insertWord(c, `availability-${randomUUID()}`));
  await c.query(
    `insert into user_card_status(user_id,entry_id,card_type_id,fsrs_enabled,in_learning,fsrs_reps,fsrs_stability,fsrs_difficulty,fsrs_last_interval,last_reviewed_at,next_review_at) values($1,$2,$3,true,true,$4,5,5,5,case when $4>0 then $5::timestamptz-interval '1 day' end,$6)`,
    [u, e, mode, reps, now, due],
  );
  return e;
}
async function availability(
  c: PoolClient,
  u: string,
  modes = ["word-to-definition"],
  filter = {},
  family = "meaning",
) {
  return (
    await c.query(
      "select read_training_recipe_availability_v1($1,$2,null,'curated',$3,$4) r",
      [u, modes, JSON.stringify(filter), family],
    )
  ).rows[0].r;
}
(dbUrl ? describe : describe.skip)("selected recipe availability", () => {
  const pool = new Pool({ connectionString: dbUrl });
  beforeAll(() => runMigrations(pool));
  afterAll(() => pool.end());
  test("single uncapped aggregate includes overdue and later today, excludes next study day, with separate introduced/new counts", () =>
    withTransaction(pool, async (c) => {
      const u = await owner(c);
      await card(c, u, "2026-10-02T12:00Z");
      await card(c, u, "2026-10-03T21:00Z");
      await card(c, u, "2026-10-04T02:00Z");
      await card(c, u, "2026-11-04T12:00Z");
      await card(c, u, "2026-10-03T13:00Z", "word-to-definition", undefined, 0);
      await insertWord(c, `new-${randomUUID()}`);
      expect(await availability(c, u)).toMatchObject({
        dueToday: 2,
        totalReviews: 4,
        newCards: 1,
        studyDay: "2026-10-03",
        timezone: "Europe/Amsterdam",
      });
      expect(
        await availability(c, u, ["word-to-definition"], {
          reviewTiming: "early",
        }),
      ).toMatchObject({ dueToday: 2, totalReviews: 4, newCards: 1 });
    }));
  test("directions and current first-exposure rule are exact", () =>
    withTransaction(pool, async (c) => {
      const u = await owner(c),
        e = await card(c, u, "2026-10-03T13:00Z");
      await card(c, u, "2026-10-05T13:00Z", "definition-to-word", e);
      await insertWord(c, `unintroduced-${randomUUID()}`);
      expect(
        await availability(c, u, ["word-to-definition", "definition-to-word"]),
      ).toMatchObject({ dueToday: 1, totalReviews: 2, newCards: 1 });
      expect(await availability(c, u, ["definition-to-word"])).toMatchObject({
        dueToday: 0,
        totalReviews: 1,
        newCards: 0,
      });
    }));
  test("hidden, frozen, pair exclusion and POS remain authoritative", () =>
    withTransaction(pool, async (c) => {
      const u = await owner(c);
      const allowed = await card(c, u, now),
        hidden = await card(c, u, now),
        frozen = await card(c, u, now),
        excluded = await card(c, u, now);
      await c.query(
        "update word_entries set part_of_speech='zn' where id=ANY($1::uuid[])",
        [[allowed, hidden, frozen, excluded]],
      );
      await c.query(
        "update user_card_status set hidden=true where entry_id=$1",
        [hidden],
      );
      await c.query(
        "update user_card_status set frozen_until=$2::timestamptz+interval '1 day' where entry_id=$1",
        [frozen, now],
      );
      await c.query(
        "insert into private.training_pair_exclusions(user_id,pair_key,family,entry_id,created_at) values($1,private.training_pair_key_v1('meaning',$2,null,null,'word-to-definition'),'meaning',$2,$3)",
        [u, excluded, now],
      );
      expect(
        await availability(c, u, ["word-to-definition"], {
          partOfSpeech: ["zn"],
        }),
      ).toMatchObject({ dueToday: 1, totalReviews: 1, newCards: 0 });
      expect(
        await availability(c, u, ["word-to-definition"], {
          partOfSpeech: ["ww"],
        }),
      ).toMatchObject({ dueToday: 0, totalReviews: 0, newCards: 0 });
    }));
  test("contextual Translation requires a source example and counts ordinary reverse identity", () =>
    withTransaction(pool, async (c) => {
      const u = await owner(c),
        e = await card(c, u, now);
      await card(c, u, now, "definition-to-word", e);
      const other = await card(c, u, now);
      await card(c, u, now, "definition-to-word", other);
      const node = randomUUID();
      await c.query(
        "insert into private.platform_v2_content_nodes(id,entry_id,kind,binding_state,first_source_revision,last_source_revision,source_text_fingerprint,diagnostic_locator) values($1,$2,'example','active','v1','v1',$3,'raw.meanings[0].examples[0]')",
        [node, e, `fingerprint-${node}`],
      );
      expect(
        await availability(c, u, ["definition-to-word"], {
          presentationMode: "word-in-context",
        }),
      ).toMatchObject({ dueToday: 1, totalReviews: 1, newCards: 0 });
    }));
  test("rejects foreign principal and paused sentence family", () =>
    withTransaction(pool, async (c) => {
      const u = await owner(c);
      await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
        randomUUID(),
      ]);
      await expect(availability(c, u)).rejects.toThrow("unauthorized");
    }));
  test("sentence is not a supported availability family", () =>
    withTransaction(pool, async (c) => {
      const u = await owner(c);
      await expect(
        availability(c, u, ["translation:recall"], {}, "sentence"),
      ).rejects.toThrow("invalid_training_recipe");
    }));
  test("projection has no ranking and remains pinned to installed eligibility prefix", async () => {
    const r = (
      await pool.query(
        "select prosrc from pg_proc where oid=ANY(ARRAY['private.training_recipe_eligible_cards_v1(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)'::regprocedure,'private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)'::regprocedure]) order by proname",
      )
    ).rows;
    const projection = r[0].prosrc,
      scheduler = r[1].prosrc;
    expect(projection).toContain(
      scheduler.split("), new_word_ranks AS (")[0].trim(),
    );
    expect(projection).not.toContain("new_word_ranks");
    expect(projection).not.toContain("selection_order");
  });
  test("idiom aggregate is direction-specific, unbounded and never creates targets", () =>
    withTransaction(pool, async (c) => {
      const u = await owner(c),
        e = await card(c, u, now);
      for (let n = 0; n < 3; n++) {
        const node = randomUUID(),
          explanation = randomUUID(),
          fp = `fingerprint-${node}`;
        await c.query(
          `insert into private.platform_v2_content_nodes(id,entry_id,parent_content_node_id,kind,binding_state,first_source_revision,last_source_revision,source_text_fingerprint,diagnostic_locator)
   values($1,$2,null,'idiom','active','v1','v1',$3,$4),($5,$2,$1,'idiom-explanation','active','v1','v1',$6,$7)`,
          [
            node,
            e,
            fp,
            `test.idiom.${node}`,
            explanation,
            `fp-${explanation}`,
            `test.explanation.${explanation}`,
          ],
        );
        if (n < 2) {
          const target = (
            await c.query(
              "select private.ensure_platform_v2_training_exercise_target_v1($1,$2,'idiom','direct','v1',$3) id",
              [e, node, fp],
            )
          ).rows[0].id;
          await c.query(
            "insert into user_training_exercise_state(user_id,target_id,fsrs_enabled,fsrs_reps,fsrs_last_interval,last_reviewed_at,next_review_at) values($1,$2,true,2,5,$3::timestamptz-interval '1 day',$3::timestamptz+$4*interval '1 day')",
            [u, target, now, n * 5],
          );
        }
      }
      const before = (
        await c.query(
          "select count(*)::int n from private.platform_v2_training_exercise_targets",
        )
      ).rows[0].n;
      expect(
        await availability(c, u, ["idiom:direct"], {}, "idiom"),
      ).toMatchObject({ dueToday: 1, totalReviews: 2, newCards: 1 });
      expect(
        await availability(
          c,
          u,
          ["idiom:direct", "idiom:reverse"],
          {},
          "idiom",
        ),
      ).toMatchObject({ dueToday: 1, totalReviews: 2, newCards: 4 });
      expect(
        (
          await c.query(
            "select count(*)::int n from private.platform_v2_training_exercise_targets",
          )
        ).rows[0].n,
      ).toBe(before);
    }));
  test("availability succeeds in a read-only transaction and private helper remains fenced", async () => {
    const c = await pool.connect();
    try {
      await c.query("begin read only");
      const u = randomUUID();
      await c.query("select set_config('request.jwt.claim.sub',$1,true)", [u]);
      expect(await availability(c, u)).toMatchObject({
        dueToday: 0,
        totalReviews: 0,
      });
      await c.query("rollback");
    } finally {
      c.release();
    }
    const grants = (
      await pool.query(
        "select rolname,has_function_privilege(oid,'private.training_recipe_eligible_cards_v1(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)','execute') allowed from pg_roles where rolname in ('anon','authenticated','service_role')",
      )
    ).rows;
    expect(grants.every((r) => r.allowed === false)).toBe(true);
  });
  test("selected dictionary access is checked instead of presenting unavailable material as empty", () =>
    withTransaction(pool, async (c) => {
      const u = await owner(c),
        e = await card(c, u, now);
      const d = (
        await c.query(
          "insert into dictionaries(language_code,slug,name,kind,visibility,minimum_subscription_tier,schema_key,schema_version) values('nl',$1,'Private','curated','private','free','nl-vandale-v1',1) returning id",
          [`availability-private-${u}`],
        )
      ).rows[0].id;
      await c.query("update word_entries set dictionary_id=$2 where id=$1", [
        e,
        d,
      ]);
      await c.query(
        "update dictionaries set publication_state='restricted' where id=$1",
        [d],
      );
      await c.query(
        "insert into dictionary_entitlements(dictionary_id,subject_type,subject_key,permission) values($1,'user',$2,'read')",
        [d, u],
      );
      expect(
        await availability(c, u, ["word-to-definition"], {
          dictionaryScope: {
            mode: "selected",
            languageCode: "nl",
            dictionaryIds: [d],
          },
        }),
      ).toMatchObject({ dueToday: 1, totalReviews: 1, newCards: 0 });
      await c.query(
        "delete from dictionary_entitlements where dictionary_id=$1",
        [d],
      );
      await expect(
        availability(c, u, ["word-to-definition"], {
          dictionaryScope: {
            mode: "selected",
            languageCode: "nl",
            dictionaryIds: [d],
          },
        }),
      ).rejects.toThrow("training_material_unavailable");
    }));
});
