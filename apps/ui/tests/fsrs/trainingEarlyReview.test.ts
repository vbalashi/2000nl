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

const dbUrl = getDbUrl();
const now = "2026-10-03T12:00:00.000Z";
async function owner(c: PoolClient) {
  const u = randomUUID();
  await ensureUserWithSettings(c, u);
  await c.query(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','service_role',true),set_config('training.test_reference_now',$2,true)",
    [u, now],
  );
  return u;
}
async function card(c: PoolClient, u: string, days = 1, reps = 2) {
  const e = await insertWord(c, `early-${randomUUID()}`);
  await c.query(
    `insert into user_card_status(user_id,entry_id,card_type_id,fsrs_enabled,in_learning,fsrs_reps,fsrs_stability,fsrs_difficulty,fsrs_last_interval,last_reviewed_at,next_review_at)
 values($1,$2,'word-to-definition',true,true,$3,5,5,5,case when $3>0 then $4::timestamptz-interval '1 day' end,$4::timestamptz+$5*interval '1 day')`,
    [u, e, reps, now, days],
  );
  return e;
}
async function start(
  c: PoolClient,
  u: string,
  size = "25",
  early = true,
  request = randomUUID(),
  modes = ["word-to-definition"],
  extra = {},
) {
  return (
    await c.query(
      `select start_training_session($1::uuid,$2::text[],null::uuid,'curated','review',$3::jsonb,$4::text,$5::uuid,2) s`,
      [
        u,
        modes,
        JSON.stringify({
          ...extra,
          ...(early ? { reviewTiming: "early" } : {}),
        }),
        size,
        request,
      ],
    )
  ).rows[0].s;
}
async function snapshot(c: PoolClient, u: string, s: string) {
  return (
    await c.query("select get_training_session_snapshot($1,$2) s", [u, s])
  ).rows[0].s;
}
async function idiom(
  c: PoolClient,
  u: string,
  e: string,
  direction = "direct",
  days = 1,
  reps = 2,
) {
  const node = randomUUID(),
    explanation = randomUUID(),
    fingerprint = `fingerprint-${node}`;
  await c.query(
    `insert into private.platform_v2_content_nodes(id,entry_id,parent_content_node_id,kind,binding_state,first_source_revision,last_source_revision,source_text_fingerprint,diagnostic_locator)
 values($1,$2,null,'idiom','active','test','test',$3,$4),($5,$2,$1,'idiom-explanation','active','test','test',$6,$7)`,
    [
      node,
      e,
      fingerprint,
      `test.idiom.${node}`,
      explanation,
      `fingerprint-${explanation}`,
      `test.explanation.${explanation}`,
    ],
  );
  const target = (
    await c.query(
      "select private.ensure_platform_v2_training_exercise_target_v1($1,$2,'idiom',$3,'test',$4) id",
      [e, node, direction, fingerprint],
    )
  ).rows[0].id;
  await c.query(
    `insert into user_training_exercise_state(user_id,target_id,fsrs_enabled,fsrs_reps,fsrs_stability,fsrs_difficulty,fsrs_last_interval,last_reviewed_at,next_review_at)
 values($1,$2,true,$3,5,5,5,case when $3>0 then $4::timestamptz-interval '1 day' end,$4::timestamptz+$5*interval '1 day')`,
    [u, target, reps, now, days],
  );
  return target;
}
async function idiomStart(
  c: PoolClient,
  u: string,
  size = "25",
  early = true,
  direction = "mixed",
) {
  return (
    await c.query(
      "select start_platform_v2_idiom_training_session($1,$2,$3,$4,null,'curated','review',$5,2) s",
      [
        u,
        direction,
        size,
        randomUUID(),
        JSON.stringify(early ? { reviewTiming: "early" } : {}),
      ],
    )
  ).rows[0].s;
}
(dbUrl ? describe : describe.skip)("explicit early review", () => {
  const pool = new Pool({ connectionString: dbUrl });
  beforeAll(() => runMigrations(pool));
  afterAll(() => pool.end());
  test("ordinary review remains empty; early reviews are nearest due, bounded or all, never new/unanswered/hidden/frozen", () =>
    withTransaction(pool, async (c) => {
      const u = await owner(c),
        later = await card(c, u, 30),
        near = await card(c, u, 1),
        middle = await card(c, u, 7);
      await insertWord(c, `unseen-${randomUUID()}`);
      await card(c, u, 2, 0);
      const hidden = await card(c, u, 3),
        frozen = await card(c, u, 4);
      await c.query(
        "update user_card_status set hidden=true where entry_id=$1",
        [hidden],
      );
      await c.query(
        "update user_card_status set frozen_until=$2::timestamptz+interval '1 year' where entry_id=$1",
        [frozen, now],
      );
      expect((await start(c, u, "25", false)).plannedTotal).toBe(0);
      const bounded = await start(c, u, "2");
      expect(bounded).toMatchObject({
        plannedNew: 0,
        plannedReview: 2,
        plannedPractice: 0,
        plannedTotal: 2,
      });
      expect(
        (await snapshot(c, u, bounded.sessionId)).members.map(
          (m: { entryId: string }) => m.entryId,
        ),
      ).toEqual([near, middle]);
      const all = await start(c, u, "all-due-today");
      expect(all.requestedTotal).toBe(3);
      expect(
        (await snapshot(c, u, all.sessionId)).members.map(
          (m: { entryId: string }) => m.entryId,
        ),
      ).toEqual([near, middle, later]);
    }));
  test("start retries preserve receipt identity and early timing is part of request identity", () =>
    withTransaction(pool, async (c) => {
      const u = await owner(c);
      await card(c, u);
      const request = randomUUID(),
        first = await start(c, u, "1", true, request);
      expect((await start(c, u, "1", true, request)).sessionId).toBe(
        first.sessionId,
      );
      expect(
        (
          await c.query(
            "select count(*)::int n from training_sessions where user_id=$1",
            [u],
          )
        ).rows[0].n,
      ).toBe(1);
      await expect(start(c, u, "1", false, request)).rejects.toThrow(
        "idempotency_conflict",
      );
    }));
  test("foreign principal cannot start an early session", () =>
    withTransaction(pool, async (c) => {
      const u = await owner(c);
      await card(c, u);
      await c.query("select set_config('request.jwt.claim.sub',$1,true)", [
        randomUUID(),
      ]);
      await expect(start(c, u)).rejects.toThrow("unauthorized");
    }));
  test("early mode does not accept a new/both filter", () =>
    withTransaction(pool, async (c) => {
      const u = await owner(c);
      await expect(
        c.query(
          "select start_training_session($1,ARRAY['word-to-definition'],null,'curated','both','{\"reviewTiming\":\"early\"}', '5',$2,2)",
          [u, randomUUID()],
        ),
      ).rejects.toThrow("invalid_training_review_timing");
    }));
  test.each(["fail", "hard", "success", "easy"])(
    "%s uses real elapsed time, ordinary FSRS and one receipt",
    async (result) => {
      for (const elapsed of ["1 day", "1 hour"])
        await withTransaction(pool, async (c) => {
          const u = await owner(c),
            e = await card(c, u, 30);
          await c.query(
            "update user_card_status set last_reviewed_at=$2::timestamptz-$3::interval where entry_id=$1",
            [e, now, elapsed],
          );
          const grade = ["fail", "hard", "success", "easy"].indexOf(result) + 1;
          const computed = (
            await c.query(
              "select fsrs6_compute(5,5,$1::timestamptz-$2::interval,$3::smallint,0.9,2,0,fsrs6_parameters()) r",
              [now, elapsed, grade],
            )
          ).rows[0].r;
          const s = await start(c, u, "1"),
            state = (
              await c.query(
                "select private.platform_v2_card_state_json($1,$2,'word-to-definition') s",
                [u, e],
              )
            ).rows[0].s,
            event = randomUUID();
          const args = [u, e, state.stateRevision, result, event, s.sessionId];
          const sql =
            "select perform_platform_v2_card_action_as_principal($1::uuid,'review-card',$2::uuid,'word-to-definition',$3::text,null,null,$4::text,$5::uuid,null,'first_party',null,$6::uuid) r";
          expect((await c.query(sql, args)).rows[0].r.status).toBe("accepted");
          expect((await c.query(sql, args)).rows[0].r.status).toBe("duplicate");
          const actual = (
            await c.query(
              "select fsrs_stability::float8 stability,fsrs_difficulty::float8 difficulty,fsrs_last_interval::float8 interval,fsrs_reps reps,last_reviewed_at,next_review_at from user_card_status where user_id=$1 and entry_id=$2",
              [u, e],
            )
          ).rows[0];
          expect(actual.stability).toBeCloseTo(computed.stability, 8);
          expect(actual.difficulty).toBeCloseTo(computed.difficulty, 8);
          expect(actual.interval).toBeCloseTo(computed.interval, 8);
          expect(actual.reps).toBe(computed.reps);
          expect(actual.last_reviewed_at.toISOString()).toBe(now);
          expect(actual.next_review_at.getTime()).toBe(
            Math.trunc(Date.parse(now) + computed.interval * 86400000),
          );
          expect((await snapshot(c, u, s.sessionId)).completedActions).toBe(1);
        });
    },
  );
  test("external review replans the early remainder without losing timing or consuming external work", () =>
    withTransaction(pool, async (c) => {
      const u = await owner(c),
        a = await card(c, u, 1),
        b = await card(c, u, 2);
      await card(c, u, 3);
      const s = await start(c, u, "2"),
        state = (
          await c.query(
            "select private.platform_v2_card_state_json($1,$2,'word-to-definition') s",
            [u, a],
          )
        ).rows[0].s;
      await c.query(
        "select perform_platform_v2_card_action_as_principal($1::uuid,'review-card',$2::uuid,'word-to-definition',$3::text,null,null,'easy',$4::uuid,null,'first_party',null,null::uuid)",
        [u, a, state.stateRevision, randomUUID()],
      );
      const after = await snapshot(c, u, s.sessionId);
      expect(after.planRevision).toBe(1);
      expect(after.completedActions).toBe(0);
      expect(after.members[0].entryId).toBe(b);
      expect(
        after.members.filter(
          (m: { consumedAt: string | null; unavailableAt: string | null }) =>
            !m.consumedAt && !m.unavailableAt,
        ),
      ).toHaveLength(2);
    }));

  test("idiom mixed early run orders directions globally by due, keeps exact target and excludes unanswered", () =>
    withTransaction(pool, async (c) => {
      const u = await owner(c),
        e = await card(c, u);
      const later = await idiom(c, u, e, "direct", 30),
        near = await idiom(c, u, e, "reverse", 1);
      await idiom(c, u, e, "direct", 2, 0);
      expect((await idiomStart(c, u, "5", false)).plannedTotal).toBe(0);
      const early = await idiomStart(c, u, "1");
      expect(early).toMatchObject({
        plannedTotal: 1,
        plannedReview: 1,
        plannedNew: 0,
      });
      expect(early.members[0].targetId).toBe(near);
      const all = await idiomStart(c, u, "all-due-today");
      expect(all.requestedTotal).toBe(2);
      expect(all.members.map((m: { targetId: string }) => m.targetId)).toEqual([
        near,
        later,
      ]);
    }));
  test(
    "all early idioms are not silently capped at the candidate page size",
    () =>
      withTransaction(pool, async (c) => {
        const u = await owner(c),
          e = await card(c, u);
        for (let i = 0; i < 1001; i++) await idiom(c, u, e, "direct", i + 1);
        const all = await idiomStart(c, u, "all-due-today", true, "direct");
        expect(all.plannedTotal).toBe(1001);
        expect(all.requestedTotal).toBe(1001);
        expect(all.members).toHaveLength(1001);
      }),
    20000,
  );
  test("early selection retains POS, requested directions, pair exclusion and revoked dictionary access", () =>
    withTransaction(pool, async (c) => {
      const u = await owner(c),
        allowed = await card(c, u),
        excluded = await card(c, u),
        blocked = await card(c, u);
      await c.query(
        "update word_entries set part_of_speech='zn' where id=ANY($1::uuid[])",
        [[allowed, excluded, blocked]],
      );
      await c.query(
        `insert into private.training_pair_exclusions(user_id,pair_key,family,entry_id,created_at)
      values($1,private.training_pair_key_v1('meaning',$2,null,null,'word-to-definition'),'meaning',$2,$3)`,
        [u, excluded, now],
      );
      const dictionary = (
        await c.query(
          `insert into dictionaries(language_code,slug,name,kind,visibility,minimum_subscription_tier,schema_key,schema_version)
      values('nl',$1,'Private','curated','private','free','nl-vandale-v1',1) returning id`,
          [`early-private-${u}`],
        )
      ).rows[0].id;
      await c.query("update word_entries set dictionary_id=$2 where id=$1", [
        blocked,
        dictionary,
      ]);
      const session = await start(
        c,
        u,
        "25",
        true,
        randomUUID(),
        ["word-to-definition"],
        { partOfSpeech: ["zn"] },
      );
      expect(
        (await snapshot(c, u, session.sessionId)).members.map(
          (m: { entryId: string }) => m.entryId,
        ),
      ).toEqual([allowed]);
      expect(
        (await start(c, u, "25", true, randomUUID(), ["definition-to-word"]))
          .plannedTotal,
      ).toBe(0);
      expect(
        (
          await start(c, u, "25", true, randomUUID(), ["word-to-definition"], {
            partOfSpeech: ["ww"],
          })
        ).plannedTotal,
      ).toBe(0);
    }));
  test("early helper is private to the authoritative functions", async () => {
    const rows = (
      await pool.query(`select rolname,has_function_privilege(oid,'private.training_review_early_v1(jsonb,text)','execute') allowed
      from pg_roles where rolname in ('anon','authenticated','service_role') order by rolname`)
    ).rows;
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.allowed === false)).toBe(true);
  });
  test("answered short-interval learning cards remain eligible alongside review cards", () =>
    withTransaction(pool, async (c) => {
      const u = await owner(c),
        learning = await card(c, u, 1),
        review = await card(c, u, 2),
        unanswered = await card(c, u, 1, 0);
      await c.query(
        "update user_card_status set fsrs_last_interval=0.1 where entry_id=ANY($1::uuid[])",
        [[learning, unanswered]],
      );
      const session = await start(c, u, "25");
      expect(session).toMatchObject({
        plannedTotal: 2,
        plannedNew: 0,
        plannedReview: 2,
        plannedPractice: 0,
      });
      const members = (await snapshot(c, u, session.sessionId)).members;
      expect(members.map((m: { entryId: string }) => m.entryId)).toEqual([
        learning,
        review,
      ]);
      expect(
        members.map((m: { queueSource: string }) => m.queueSource),
      ).toEqual(["learning", "review"]);
    }));
  test("early contextual Translation uses introduced reverse identity, freezes an example and keeps normal FSRS", () =>
    withTransaction(pool, async (c) => {
      const u = await owner(c),
        e = await card(c, u),
        withoutExample = await card(c, u),
        node = randomUUID();
      for (const entry of [e, withoutExample])
        await c.query(
          `insert into user_card_status(user_id,entry_id,card_type_id,fsrs_enabled,in_learning,fsrs_reps,fsrs_stability,fsrs_difficulty,fsrs_last_interval,last_reviewed_at,next_review_at)
      values($1,$2,'definition-to-word',true,true,2,5,5,5,$3::timestamptz-interval '1 day',$3::timestamptz+interval '30 days')`,
          [u, entry, now],
        );
      await c.query(
        `insert into private.platform_v2_content_nodes(id,entry_id,kind,binding_state,first_source_revision,last_source_revision,source_text_fingerprint,diagnostic_locator,source_order)
      values($1,$2,'example','active','test','test',$3,'raw.meanings[0].examples[0]',1)`,
        [node, e, `fingerprint-${node}`],
      );
      const filter = { presentationMode: "word-in-context" };
      expect(
        (
          await start(
            c,
            u,
            "5",
            false,
            randomUUID(),
            ["definition-to-word"],
            filter,
          )
        ).plannedTotal,
      ).toBe(0);
      const session = await start(
        c,
        u,
        "5",
        true,
        randomUUID(),
        ["definition-to-word"],
        filter,
      );
      expect(session).toMatchObject({
        plannedTotal: 1,
        plannedNew: 0,
        plannedReview: 1,
      });
      const source = (
        await c.query("select read_training_word_context_member($1,$2,$3) s", [
          u,
          session.sessionId,
          e,
        ])
      ).rows[0].s;
      expect(source).toMatchObject({ entryId: e, contentNodeId: node });
      const state = (
        await c.query(
          "select private.platform_v2_card_state_json($1,$2,'definition-to-word') s",
          [u, e],
        )
      ).rows[0].s;
      await c.query(
        "select perform_platform_v2_card_action_as_principal($1::uuid,'review-card',$2::uuid,'definition-to-word',$3::text,null,null,'success',$4::uuid,null,'first_party',null,$5::uuid)",
        [u, e, state.stateRevision, randomUUID(), session.sessionId],
      );
      expect(
        (
          await c.query(
            "select fsrs_reps from user_card_status where user_id=$1 and entry_id=$2 and card_type_id='definition-to-word'",
            [u, e],
          )
        ).rows[0].fsrs_reps,
      ).toBe(3);
      expect(
        (
          await c.query(
            "select fsrs_reps from user_card_status where user_id=$1 and entry_id=$2 and card_type_id='word-to-definition'",
            [u, e],
          )
        ).rows[0].fsrs_reps,
      ).toBe(2);
    }));
  test("Known cards remain absent from early review even with existing FSRS history", () =>
    withTransaction(pool, async (c) => {
      const u = await owner(c),
        e = await card(c, u);
      const state = (
        await c.query(
          "select private.platform_v2_card_state_json($1,$2,'word-to-definition') s",
          [u, e],
        )
      ).rows[0].s;
      await c.query(
        "select perform_platform_v2_card_action_as_principal($1::uuid,'mark-known',$2::uuid,'word-to-definition',$3::text,null,null,null,$4::uuid,null,'first_party',null,null::uuid)",
        [u, e, state.stateRevision, randomUUID()],
      );
      expect((await start(c, u)).plannedTotal).toBe(0);
    }));
});
