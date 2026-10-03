import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Pool, type PoolClient } from "pg";
import {
  ensureUserWithSettings,
  getDbUrl,
  insertWord,
  runMigrations,
  withTransaction,
} from "./dbTestUtils";
const dbUrl = getDbUrl();
(dbUrl ? describe : describe.skip)(
  "external ordinary grades reconcile remainder",
  () => {
    const pool = new Pool({ connectionString: dbUrl });
    beforeAll(async () => runMigrations(pool));
    afterAll(async () => pool.end());
    const owner = async (c: PoolClient) => {
      const id = randomUUID();
      await ensureUserWithSettings(c, id);
      await c.query(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','service_role',true),set_config('training.test_reference_now',statement_timestamp()::text,true)",
        [id],
      );
      return id;
    };
    const entry = async (c: PoolClient, u: string) => {
      const id = await insertWord(c, `replan-${randomUUID()}`);
      await c.query(
        `insert into user_card_status(user_id,entry_id,card_type_id,fsrs_enabled,in_learning,fsrs_reps,fsrs_stability,fsrs_difficulty,fsrs_last_interval,last_reviewed_at,next_review_at) select $1,$2,mode,true,true,1,5,5,1,statement_timestamp()-interval '1 day',statement_timestamp()-interval '1 hour' from unnest(ARRAY['word-to-definition','definition-to-word']) mode`,
        [u, id],
      );
      return id;
    };
    const start = async (
      c: PoolClient,
      u: string,
      modes = ["word-to-definition"],
      filter = {},
    ) =>
      (
        await c.query(
          `select start_training_session($1::uuid,$2::text[],null::uuid,'curated','both',$3::jsonb,'2',$4::uuid,2) s`,
          [u, modes, JSON.stringify(filter), randomUUID()],
        )
      ).rows[0].s;
    const snapshot = async (c: PoolClient, u: string, s: string) =>
      (
        await c.query(
          "select get_training_session_snapshot($1::uuid,$2::uuid) s",
          [u, s],
        )
      ).rows[0].s;
    const grade = async (
      c: PoolClient,
      u: string,
      e: string,
      mode: string,
      result: string,
      session: string | null = null,
    ) => {
      const state = (
        await c.query(
          "select private.platform_v2_card_state_json($1,$2,$3) s",
          [u, e, mode],
        )
      ).rows[0].s;
      const event = randomUUID();
      const call = () =>
        c.query(
          `select perform_platform_v2_card_action_as_principal($1::uuid,'review-card',$2::uuid,$3::text,$4::text,null,null,$5::text,$6::uuid,null,'first_party',null,$7::uuid) r`,
          [u, e, mode, state.stateRevision, result, event, session],
        );
      return { first: (await call()).rows[0].r, call, event };
    };
    test.each(["fail", "hard", "success", "easy"])(
      "Library %s changes only exact direct once and does not consume a member",
      async (result) =>
        withTransaction(pool, async (c) => {
          const u = await owner(c),
            e = await entry(c, u),
            sibling = await entry(c, u),
            s = await start(c, u);
          const before = (
            await c.query(
              "select entry_id,card_type_id,fsrs_reps,state_revision from user_card_status where user_id=$1 order by entry_id,card_type_id",
              [u],
            )
          ).rows;
          const action = await grade(c, u, e, "word-to-definition", result);
          expect(action.first.status).toBe("accepted");
          expect((await action.call()).rows[0].r.status).toBe("duplicate");
          const states = (
            await c.query(
              "select entry_id,card_type_id,fsrs_reps,state_revision from user_card_status where user_id=$1 order by entry_id,card_type_id",
              [u],
            )
          ).rows;
          for (const row of states) {
            const old = before.find(
              (x) =>
                x.entry_id === row.entry_id &&
                x.card_type_id === row.card_type_id,
            )!;
            if (row.entry_id === e && row.card_type_id === "word-to-definition")
              expect(row.fsrs_reps).toBe(old.fsrs_reps + 1);
            else expect(row).toEqual(old);
          }
          const after = await snapshot(c, u, s.sessionId);
          expect(after.completedActions).toBe(0);
          expect(after.planRevision).toBe(1);
          expect(
            after.members
              .filter((m: any) => !m.consumedAt && !m.unavailableAt)
              .map((m: any) => m.entryId),
          ).toEqual([sibling]);
          expect((await snapshot(c, u, s.sessionId)).planRevision).toBe(1);
          expect(
            (
              await c.query(
                "select count(*)::int n from private.training_session_replan_history where session_id=$1",
                [s.sessionId],
              )
            ).rows[0].n,
          ).toBe(1);
        }),
    );
    test("preserves consumed identity and remaining budget", async () =>
      withTransaction(pool, async (c) => {
        const u = await owner(c);
        await entry(c, u);
        await entry(c, u);
        await entry(c, u);
        const s = await start(c, u),
          original = await snapshot(c, u, s.sessionId);
        const first = original.members[0],
          second = original.members[1];
        expect(
          (
            await grade(
              c,
              u,
              first.entryId,
              first.cardTypeId,
              "success",
              s.sessionId,
            )
          ).first.status,
        ).toBe("accepted");
        const readConsumed = async () =>
          (
            await c.query(
              "select to_jsonb(m) m from training_session_members m where session_id=$1 and consumed_at is not null",
              [s.sessionId],
            )
          ).rows[0].m;
        const consumed = await readConsumed();
        await grade(c, u, second.entryId, second.cardTypeId, "easy");
        const after = await snapshot(c, u, s.sessionId);
        expect(after.completedActions).toBe(1);
        expect(after.requestedTotal).toBe(2);
        expect(after.plannedTotal).toBe(2);
        expect(
          after.members.filter((m: any) => !m.consumedAt && !m.unavailableAt),
        ).toHaveLength(1);
        expect(await readConsumed()).toEqual(consumed);
      }));
    test("Again remains eligible when due; exhaustion never widens directions", async () =>
      withTransaction(pool, async (c) => {
        const u = await owner(c),
          e = await entry(c, u);
        await c.query(
          "update user_card_status set fsrs_stability=0.1,fsrs_last_interval=0 where user_id=$1 and entry_id=$2 and card_type_id='word-to-definition'",
          [u, e],
        );
        const s = await start(c, u);
        await grade(c, u, e, "word-to-definition", "fail");
        const due = (
          await c.query(
            "select next_review_at from user_card_status where user_id=$1 and entry_id=$2 and card_type_id='word-to-definition'",
            [u, e],
          )
        ).rows[0].next_review_at;
        await c.query(
          "select set_config('training.test_reference_now',$1,true)",
          [new Date(new Date(due).getTime() + 1000).toISOString()],
        );
        expect(
          (await snapshot(c, u, s.sessionId)).members.some(
            (m: any) => m.entryId === e && !m.consumedAt && !m.unavailableAt,
          ),
        ).toBe(true);
        const second = await grade(c, u, e, "word-to-definition", "easy");
        expect(second.first.status).toBe("accepted");
        const empty = await snapshot(c, u, s.sessionId);
        expect(empty.completedActions).toBe(0);
        expect(empty.plannedTotal).toBe(0);
        expect(empty.completionReason).toBe("exhausted");
      }));
    test.each(["fail", "hard", "success", "easy"])(
      "context %s changes exact reverse without sentence schedule",
      async (result) =>
        withTransaction(pool, async (c) => {
          const u = await owner(c),
            e = await entry(c, u),
            sibling = await entry(c, u);
          for (const id of [e, sibling])
            await c.query(
              `insert into private.platform_v2_content_nodes(id,entry_id,kind,binding_state,first_source_revision,last_source_revision,source_text_fingerprint,diagnostic_locator) values($1,$2,'example','active','v1','v1','context-fingerprint','raw.meanings[0].examples[0]')`,
              [randomUUID(), id],
            );
          const s = await start(c, u, ["definition-to-word"], {
              presentationMode: "word-in-context",
            }),
            initial = await snapshot(c, u, s.sessionId),
            selected = initial.members[0].entryId;
          const readDirect = async () =>
            (
              await c.query(
                "select to_jsonb(s) s from user_card_status s where user_id=$1 and entry_id=$2 and card_type_id='word-to-definition'",
                [u, selected],
              )
            ).rows[0].s;
          const direct = await readDirect(),
            action = await grade(
              c,
              u,
              selected,
              "definition-to-word",
              result,
              s.sessionId,
            );
          expect(action.first.status).toBe("accepted");
          expect((await action.call()).rows[0].r.status).toBe("duplicate");
          expect(await readDirect()).toEqual(direct);
          expect(
            (
              await c.query(
                "select fsrs_reps from user_card_status where user_id=$1 and entry_id=$2 and card_type_id='definition-to-word'",
                [u, selected],
              )
            ).rows[0].fsrs_reps,
          ).toBe(2);
          expect(
            (
              await c.query(
                "select count(*)::int n from user_training_exercise_state where user_id=$1",
                [u],
              )
            ).rows[0].n,
          ).toBe(0);
          expect((await snapshot(c, u, s.sessionId)).completedActions).toBe(1);
        }),
    );
    test("first acquaintance is direct; Learn enrolls reverse without assigning grade", async () =>
      withTransaction(pool, async (c) => {
        const u = await owner(c),
          e = await insertWord(c, `first-${randomUUID()}`),
          s = await start(c, u, ["word-to-definition", "definition-to-word"]);
        expect(
          (await snapshot(c, u, s.sessionId)).members.map(
            (m: any) => m.cardTypeId,
          ),
        ).toEqual(["word-to-definition"]);
        const state = (
          await c.query(
            "select private.platform_v2_card_state_json($1,$2,'word-to-definition') s",
            [u, e],
          )
        ).rows[0].s;
        await c.query(
          `select perform_platform_v2_card_action_as_principal($1::uuid,'start-learning',$2::uuid,'word-to-definition',$3::text,null,null,null,$4::uuid,null,'first_party',null,null::uuid)`,
          [u, e, state.stateRevision, randomUUID()],
        );
        const rows = (
          await c.query(
            "select card_type_id,seen_count,fsrs_reps,fsrs_last_grade,in_learning from user_card_status where user_id=$1 and entry_id=$2 order by card_type_id",
            [u, e],
          )
        ).rows;
        expect(rows).toEqual([
          {
            card_type_id: "definition-to-word",
            seen_count: 0,
            fsrs_reps: 0,
            fsrs_last_grade: null,
            in_learning: true,
          },
          {
            card_type_id: "word-to-definition",
            seen_count: 1,
            fsrs_reps: 0,
            fsrs_last_grade: null,
            in_learning: true,
          },
        ]);
        expect(
          (await snapshot(c, u, s.sessionId)).members.some(
            (m: any) => m.cardTypeId === "definition-to-word",
          ),
        ).toBe(true);
      }));

    test("Known then Undo invalidates twice without inventing review progress", async () =>
      withTransaction(pool, async (c) => {
        const u = await owner(c),
          e = await entry(c, u);
        await entry(c, u);
        const s = await start(c, u);
        const state = (
          await c.query(
            "select private.platform_v2_card_state_json($1,$2,'word-to-definition') s",
            [u, e],
          )
        ).rows[0].s;
        const known = (
          await c.query(
            "select perform_platform_v2_card_action_as_principal($1::uuid,'mark-known',$2::uuid,'word-to-definition',$3::text,null,null,null,$4::uuid,null,'first_party',null,null::uuid) r",
            [u, e, state.stateRevision, randomUUID()],
          )
        ).rows[0].r;
        expect(known.status).toBe("accepted");
        expect((await snapshot(c, u, s.sessionId)).planRevision).toBe(1);
        const undo = (
          await c.query(
            "select perform_platform_v2_card_action_as_principal($1::uuid,'undo-known',$2::uuid,'word-to-definition',$3::text,$4::uuid,$5::text,null,$6::uuid,null,'first_party',null,null::uuid) r",
            [
              u,
              e,
              known.card.stateRevision,
              known.card.knownMark.markId,
              known.card.knownMark.revision,
              randomUUID(),
            ],
          )
        ).rows[0].r;
        expect(undo.status).toBe("accepted");
        const after = await snapshot(c, u, s.sessionId);
        expect(after.planRevision).toBe(2);
        expect(after.completedActions).toBe(0);
        expect(
          after.members.some((m: any) => m.entryId === e && !m.unavailableAt),
        ).toBe(true);
      }));
    test("retains unavailable identity while filling only the remaining budget", async () =>
      withTransaction(pool, async (c) => {
        const u = await owner(c);
        await entry(c, u);
        await entry(c, u);
        await entry(c, u);
        const s = await start(c, u),
          initial = await snapshot(c, u, s.sessionId);
        const unavailable = initial.members[0],
          graded = initial.members[1];
        await c.query(
          "update training_session_members set unavailable_at=statement_timestamp(),unavailable_reason='projection-missing' where session_id=$1 and entry_id=$2",
          [s.sessionId, unavailable.entryId],
        );
        await grade(c, u, graded.entryId, graded.cardTypeId, "easy");
        const after = await snapshot(c, u, s.sessionId);
        expect(after.requestedTotal).toBe(2);
        expect(after.completedActions).toBe(0);
        expect(after.plannedTotal).toBe(1);
        expect(after.plannedPractice).toBe(0);
        expect(after.plannedNew + after.plannedReview).toBe(after.plannedTotal);
        expect(
          after.members.filter((m: any) => m.entryId === unavailable.entryId),
        ).toEqual([
          expect.objectContaining({
            ordinal: unavailable.ordinal,
            unavailableReason: "projection-missing",
          }),
        ]);
        expect(
          after.members.filter((m: any) => !m.consumedAt && !m.unavailableAt),
        ).toHaveLength(1);
      }));
  },
);
