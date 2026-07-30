import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import {
  ensureUserWithSettings,
  getDbUrl,
  insertWord,
  runMigrations,
  withTransaction,
} from "./dbTestUtils";

const dbUrl = getDbUrl();
const describeIfDb = dbUrl ? describe : describe.skip;

describeIfDb("Platform V2 Known Mark RPC", () => {
  const pool = new Pool({ connectionString: dbUrl });
  const cardTypeId = "word-to-definition";

  beforeAll(async () => {
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  test("marks an untracked card known without manufacturing an FSRS review", async () => {
    const userId = randomUUID();
    const clientEventId = randomUUID();

    await withTransaction(
      pool,
      async (client) => {
        await ensureUserWithSettings(client, userId);
        const entryId = await insertWord(
          client,
          `platform-known-new-${Date.now()}`,
        );

        const { rows } = await client.query(
          `select perform_platform_v2_card_action(
             $1::uuid,
             'mark-known',
             $2::uuid,
             $3::text,
             'untracked',
             null,
             null,
             null,
             $4::uuid,
             null,
             'first_party',
             null
           ) as result`,
          [userId, entryId, cardTypeId, clientEventId],
        );

        expect(rows[0].result).toEqual(
          expect.objectContaining({
            status: "accepted",
            actionId: "mark-known",
            clientEventId,
            card: expect.objectContaining({
              entryId,
              cardTypeId,
              scheduler: expect.objectContaining({
                phase: "not-started",
              }),
              knownMark: expect.objectContaining({
                markId: expect.any(String),
                revision: expect.any(String),
                markedAt: expect.any(String),
              }),
              stateRevision: expect.any(String),
            }),
          }),
        );

        const state = await client.query(
          `select fsrs_reps, fsrs_lapses, fsrs_last_grade, last_reviewed_at,
                  in_learning, hidden, frozen_until
             from user_card_status
            where user_id = $1
              and entry_id = $2
              and card_type_id = $3`,
          [userId, entryId, cardTypeId],
        );
        expect(state.rows).toEqual([
          {
            fsrs_reps: 0,
            fsrs_lapses: 0,
            fsrs_last_grade: null,
            last_reviewed_at: null,
            in_learning: false,
            hidden: false,
            frozen_until: null,
          },
        ]);

        const reviewLog = await client.query(
          `select count(*)::int as count
             from user_review_log
            where user_id = $1
              and word_id = $2
              and mode = $3`,
          [userId, entryId, cardTypeId],
        );
        expect(reviewLog.rows[0].count).toBe(0);

        const projectedState = await client.query(
          `select *
             from get_user_card_states_for_entries(
               $1,
               ARRAY[$2]::uuid[],
               ARRAY[$3]::text[]
             )`,
          [userId, entryId, cardTypeId],
        );
        expect(projectedState.rows).toEqual([
          expect.objectContaining({
            entry_id: entryId,
            card_type_id: cardTypeId,
            state_revision: rows[0].result.card.stateRevision,
            known_mark_id: rows[0].result.card.knownMark.markId,
            known_mark_revision: rows[0].result.card.knownMark.revision,
            known_marked_at: expect.any(Date),
          }),
        ]);

        const events = await client.query(
          `select action, result, client_event_id
             from user_card_action_events
            where user_id = $1
              and entry_id = $2
              and card_type_id = $3`,
          [userId, entryId, cardTypeId],
        );
        expect(events.rows).toEqual([
          {
            action: "mark-known",
            result: null,
            client_event_id: clientEventId,
          },
        ]);
      },
      userId,
    );
  });

  test("uses the same revision-checked boundary for Start Learning and Review", async () => {
    const userId = randomUUID();

    await withTransaction(
      pool,
      async (client) => {
        await ensureUserWithSettings(client, userId);
        const entryId = await insertWord(
          client,
          `platform-v2-learning-review-${Date.now()}`,
        );

        const started = await client.query(
          `select perform_platform_v2_card_action(
            $1::uuid, 'start-learning', $2::uuid, $3::text, 'untracked',
            null, null, null, $4::uuid, null, 'first_party', null
          ) as result`,
          [userId, entryId, cardTypeId, randomUUID()],
        );
        expect(started.rows[0].result.card).toEqual(
          expect.objectContaining({
            scheduler: expect.objectContaining({ phase: "learning" }),
            knownMark: null,
          }),
        );

        const reviewed = await client.query(
          `select perform_platform_v2_card_action(
            $1::uuid, 'review-card', $2::uuid, $3::text, $4::text,
            null, null, 'success', $5::uuid, null, 'first_party', null
          ) as result`,
          [
            userId,
            entryId,
            cardTypeId,
            started.rows[0].result.card.stateRevision,
            randomUUID(),
          ],
        );
        expect(reviewed.rows[0].result.card).toEqual(
          expect.objectContaining({
            scheduler: expect.objectContaining({ phase: "learning" }),
            knownMark: null,
          }),
        );

        const events = await client.query(
          `select action, result
             from user_card_action_events
            where user_id = $1
              and entry_id = $2
              and card_type_id = $3`,
          [userId, entryId, cardTypeId],
        );
        expect(events.rows).toHaveLength(2);
        expect(events.rows).toEqual(
          expect.arrayContaining([
            { action: "start-learning", result: null },
            { action: "review-card", result: "success" },
          ]),
        );
      },
      userId,
    );
  });

  test("undoes only the active Known Mark and restores the preserved scheduler state", async () => {
    const userId = randomUUID();
    const markEventId = randomUUID();
    const undoEventId = randomUUID();

    await withTransaction(
      pool,
      async (client) => {
        await ensureUserWithSettings(client, userId);
        const entryId = await insertWord(
          client,
          `platform-known-undo-${Date.now()}`,
        );

        await client.query(
          `select handle_card_review($1, $2, $3, 'hard', $4)`,
          [userId, entryId, cardTypeId, randomUUID()],
        );
        const beforeMark = await client.query(
          `select state_revision,
                  fsrs_stability, fsrs_difficulty, fsrs_reps, fsrs_lapses,
                  fsrs_last_grade, fsrs_last_interval,
                  fsrs_target_retention, fsrs_params_version, fsrs_enabled,
                  next_review_at, last_reviewed_at, success_count, last_result,
                  hidden, frozen_until, in_learning, learning_due_at
             from user_card_status
            where user_id = $1
              and entry_id = $2
              and card_type_id = $3`,
          [userId, entryId, cardTypeId],
        );

        const marked = await client.query(
          `select perform_platform_v2_card_action(
             $1::uuid,
             'mark-known',
             $2::uuid,
             $3::text,
             $4::text,
             null,
             null,
             null,
             $5::uuid,
             null,
             'first_party',
             null
           ) as result`,
          [
            userId,
            entryId,
            cardTypeId,
            beforeMark.rows[0].state_revision,
            markEventId,
          ],
        );
        const markedCard = marked.rows[0].result.card;

        const undone = await client.query(
          `select perform_platform_v2_card_action(
             $1::uuid,
             'undo-known',
             $2::uuid,
             $3::text,
             $4::text,
             $5::uuid,
             $6::text,
             null,
             $7::uuid,
             null,
             'first_party',
             null
           ) as result`,
          [
            userId,
            entryId,
            cardTypeId,
            markedCard.stateRevision,
            markedCard.knownMark.markId,
            markedCard.knownMark.revision,
            undoEventId,
          ],
        );

        expect(undone.rows[0].result).toEqual(
          expect.objectContaining({
            status: "accepted",
            actionId: "undo-known",
            clientEventId: undoEventId,
            card: expect.objectContaining({
              entryId,
              cardTypeId,
              scheduler: expect.objectContaining({
                phase: "reviewing",
              }),
              knownMark: null,
              stateRevision: expect.not.stringMatching(
                markedCard.stateRevision,
              ),
            }),
          }),
        );

        const marks = await client.query(
          `select id, revision, cleared_at, undo_event_id
             from user_card_known_marks
            where user_id = $1
              and entry_id = $2
              and card_type_id = $3`,
          [userId, entryId, cardTypeId],
        );
        expect(marks.rows).toEqual([
          expect.objectContaining({
            id: markedCard.knownMark.markId,
            revision: markedCard.knownMark.revision,
            cleared_at: expect.any(Date),
            undo_event_id: expect.any(String),
          }),
        ]);

        const events = await client.query(
          `select action
             from user_card_action_events
            where user_id = $1
              and entry_id = $2
              and card_type_id = $3
            order by created_at, action`,
          [userId, entryId, cardTypeId],
        );
        expect(events.rows).toEqual([
          { action: "mark-known" },
          { action: "undo-known" },
        ]);

        const afterUndo = await client.query(
          `select fsrs_stability, fsrs_difficulty, fsrs_reps, fsrs_lapses,
                  fsrs_last_grade, fsrs_last_interval,
                  fsrs_target_retention, fsrs_params_version, fsrs_enabled,
                  next_review_at, last_reviewed_at, success_count, last_result,
                  hidden, frozen_until, in_learning, learning_due_at
             from user_card_status
            where user_id = $1
              and entry_id = $2
              and card_type_id = $3`,
          [userId, entryId, cardTypeId],
        );
        const { state_revision: _stateRevision, ...preservedState } =
          beforeMark.rows[0];
        expect(afterUndo.rows).toEqual([preservedState]);

        await client.query(
          `select handle_card_review($1, $2, $3, 'success', $4)`,
          [userId, entryId, cardTypeId, randomUUID()],
        );
        const legacyReviews = await client.query(
          `select count(*)::int as count
             from user_review_log
            where user_id = $1
              and word_id = $2
              and mode = $3`,
          [userId, entryId, cardTypeId],
        );
        expect(legacyReviews.rows[0].count).toBe(2);
      },
      userId,
    );
  });

  test("rejects legacy learning and review mutations while Known is active", async () => {
    const userId = randomUUID();
    const clientEventId = randomUUID();

    await withTransaction(
      pool,
      async (client) => {
        await ensureUserWithSettings(client, userId);
        const entryId = await insertWord(
          client,
          `platform-known-legacy-guard-${Date.now()}`,
        );

        await client.query(
          `select perform_platform_v2_card_action(
             $1::uuid,
             'mark-known',
             $2::uuid,
             $3::text,
             'untracked',
             null,
             null,
             null,
             $4::uuid,
             null,
             'first_party',
             null
           )`,
          [userId, entryId, cardTypeId, clientEventId],
        );

        await client.query("savepoint known_start_guard");
        await expect(
          client.query(
            `select start_learning_entry_card($1, $2, $3)`,
            [userId, entryId, cardTypeId],
          ),
        ).rejects.toThrow(/card_is_known/);
        await client.query("rollback to savepoint known_start_guard");
        await client.query("release savepoint known_start_guard");

        await client.query("savepoint known_review_guard");
        await expect(
          client.query(
            `select handle_card_review($1, $2, $3, 'success', $4)`,
            [userId, entryId, cardTypeId, randomUUID()],
          ),
        ).rejects.toThrow(/card_is_known/);
        await client.query("rollback to savepoint known_review_guard");
        await client.query("release savepoint known_review_guard");

        const preserved = await client.query(
          `select fsrs_reps, fsrs_lapses, fsrs_last_grade, last_reviewed_at,
                  in_learning, hidden, frozen_until
             from user_card_status
            where user_id = $1
              and entry_id = $2
              and card_type_id = $3`,
          [userId, entryId, cardTypeId],
        );
        expect(preserved.rows).toEqual([
          {
            fsrs_reps: 0,
            fsrs_lapses: 0,
            fsrs_last_grade: null,
            last_reviewed_at: null,
            in_learning: false,
            hidden: false,
            frozen_until: null,
          },
        ]);
      },
      userId,
    );
  });

  test("excludes an active Known Mark from broad and source-filtered training queues", async () => {
    const userId = randomUUID();
    const clientEventId = randomUUID();

    await withTransaction(
      pool,
      async (client) => {
        await ensureUserWithSettings(client, userId);
        const entryId = await insertWord(
          client,
          `platform-known-selection-${Date.now()}`,
        );
        const { rows: listRows } = await client.query(
          `insert into user_word_lists (
             user_id,
             language_code,
             primary_language_code,
             name
           )
           values ($1, 'nl', 'nl', $2)
           returning id`,
          [userId, `Known selection ${Date.now()}`],
        );
        const listId = listRows[0].id;
        await client.query(
          `insert into user_word_list_items (list_id, word_id)
           values ($1, $2)`,
          [listId, entryId],
        );

        await client.query(
          `select handle_card_review($1, $2, $3, 'success', $4)`,
          [userId, entryId, cardTypeId, randomUUID()],
        );
        const dueState = await client.query(
          `update user_card_status
              set next_review_at = now() - interval '1 day',
                  fsrs_last_interval = 2
            where user_id = $1
              and entry_id = $2
              and card_type_id = $3
          returning state_revision`,
          [userId, entryId, cardTypeId],
        );

        await client.query(
          `select perform_platform_v2_card_action(
             $1::uuid,
             'mark-known',
             $2::uuid,
             $3::text,
             $4::text,
             null,
             null,
             null,
             $5::uuid,
             null,
             'first_party',
             null
           )`,
          [
            userId,
            entryId,
            cardTypeId,
            dueState.rows[0].state_revision,
            clientEventId,
          ],
        );

        const broad = await client.query(
          `select get_next_card(
             $1,
             ARRAY[$2]::text[],
             ARRAY[]::uuid[],
             $3,
             'user',
             'review',
             'review',
             ARRAY[]::text[]
           ) as item`,
          [userId, cardTypeId, listId],
        );
        expect(broad.rows).toEqual([]);

        const filtered = await client.query(
          `select get_next_filtered_card(
             $1,
             ARRAY[$2]::text[],
             ARRAY[]::uuid[],
             $3,
             'user',
             'review',
             'review',
             ARRAY[]::text[],
             '{}'::jsonb
           ) as item`,
          [userId, cardTypeId, listId],
        );
        expect(filtered.rows).toEqual([]);

        const bypassPrivilege = await client.query(
          `select has_function_privilege(
             'authenticated',
             'public.get_next_card_without_known(uuid,text[],uuid[],uuid,text,text,text,text[])',
             'EXECUTE'
           ) as can_execute`,
        );
        expect(bypassPrivilege.rows).toEqual([{ can_execute: false }]);
      },
      userId,
    );
  });

  test("persists source-context-v2 provenance atomically with a Known Mark", async () => {
    const userId = randomUUID();
    const clientEventId = randomUUID();
    const sourceContext = {
      contractVersion: "source-context-v2",
      source: {
        kind: "youtube_video",
        provider: "youtube",
        externalId: "4EE7m94mJpk",
        url: "https://example.invalid/not-canonical",
        title: "Client supplied title",
        languageCode: "NL",
      },
      artifact: {
        artifactKind: "caption_phrase_set",
        producer: "audiofilms_backend",
        phraseSetRevisionId: "phrases-known-v1",
      },
      location: {
        kind: "caption_phrase",
        phraseIndex: 12,
        startMs: 54210,
        endMs: 58100,
      },
      selection: {
        clickedForm: "huis",
      },
      context: {
        clickedForm: "huis",
        text: "Ik ga naar huis.",
      },
    };

    await withTransaction(
      pool,
      async (client) => {
        await ensureUserWithSettings(client, userId);
        await client.query(
          `insert into connected_clients (
             client_id,
             display_name,
             client_type,
             allowed_redirect_uris,
             allowed_scopes
           )
           values (
             'audiofilms_youtube_extension',
             'AudioFilms YouTube Extension',
             'chrome_extension',
             ARRAY['https://example.com/callback'],
             ARRAY['platform:read', 'platform:write', 'offline_access']
           )
           on conflict (client_id) do nothing`,
        );
        await client.query(
          `insert into connected_client_grants (
             client_id,
             user_id,
             scopes
           )
           values (
             'audiofilms_youtube_extension',
             $1,
             ARRAY['platform:read', 'platform:write', 'offline_access']
           )
           on conflict (client_id, user_id) do update
             set scopes = excluded.scopes,
                 revoked_at = null`,
          [userId],
        );
        const entryId = await insertWord(
          client,
          `platform-known-provenance-${Date.now()}`,
        );

        const { rows } = await client.query(
          `select perform_platform_v2_card_action(
             $1::uuid,
             'mark-known',
             $2::uuid,
             $3::text,
             'untracked',
             null,
             null,
             null,
             $4::uuid,
             $5::jsonb,
             'connected_client',
             'audiofilms_youtube_extension'
           ) as result`,
          [
            userId,
            entryId,
            cardTypeId,
            clientEventId,
            JSON.stringify(sourceContext),
          ],
        );

        expect(rows[0].result).toEqual(
          expect.objectContaining({
            status: "accepted",
            sourceId: expect.any(String),
            artifactId: expect.any(String),
            locationId: expect.any(String),
          }),
        );

        const event = await client.query(
          `select source_id, artifact_id, location_id, auth_kind,
                  connected_client_id
             from user_card_action_events
            where id = $1`,
          [rows[0].result.eventId],
        );
        expect(event.rows).toEqual([
          {
            source_id: rows[0].result.sourceId,
            artifact_id: rows[0].result.artifactId,
            location_id: rows[0].result.locationId,
            auth_kind: "connected_client",
            connected_client_id: "audiofilms_youtube_extension",
          },
        ]);

        const source = await client.query(
          `select kind, provider, external_id, canonical_url, title,
                  language_code, metadata
             from learning_sources
            where id = $1`,
          [rows[0].result.sourceId],
        );
        expect(source.rows).toEqual([
          {
            kind: "youtube_video",
            provider: "youtube",
            external_id: "4EE7m94mJpk",
            canonical_url:
              "https://www.youtube.com/watch?v=4EE7m94mJpk",
            title: null,
            language_code: "nl",
            metadata: { contractVersion: "source-context-v2" },
          },
        ]);
      },
      userId,
    );
  });

  test("returns the original receipt for an identical retry and rejects payload drift", async () => {
    const userId = randomUUID();
    const clientEventId = randomUUID();

    await withTransaction(
      pool,
      async (client) => {
        await ensureUserWithSettings(client, userId);
        const entryId = await insertWord(
          client,
          `platform-known-idempotency-${Date.now()}`,
        );
        const values = [userId, entryId, cardTypeId, clientEventId];
        const statement = `select perform_platform_v2_card_action(
          $1::uuid, 'mark-known', $2::uuid, $3::text, 'untracked',
          null, null, null, $4::uuid, null, 'first_party', null
        ) as result`;

        const accepted = await client.query(statement, values);
        const duplicate = await client.query(statement, values);

        expect(duplicate.rows[0].result).toEqual({
          ...accepted.rows[0].result,
          status: "duplicate",
        });

        await client.query("savepoint idempotency_conflict");
        await expect(
          client.query(
            `select perform_platform_v2_card_action(
              $1::uuid, 'mark-known', $2::uuid, 'definition-to-word',
              'untracked', null, null, null, $3::uuid, null,
              'first_party', null
            )`,
            [userId, entryId, clientEventId],
          ),
        ).rejects.toThrow(/platform_action_idempotency_conflict/);
        await client.query("rollback to savepoint idempotency_conflict");
        await client.query("release savepoint idempotency_conflict");

        const counts = await client.query(
          `select
             (select count(*)::int
                from user_card_action_events
               where user_id = $1 and client_event_id = $2::text) as events,
             (select count(*)::int
                from user_card_known_marks
               where user_id = $1 and entry_id = $3) as marks`,
          [userId, clientEventId, entryId],
        );
        expect(counts.rows).toEqual([{ events: 1, marks: 1 }]);
      },
      userId,
    );
  });

  test("rejects an Undo for a cleared mark after a replacement mark exists", async () => {
    const userId = randomUUID();

    await withTransaction(
      pool,
      async (client) => {
        await ensureUserWithSettings(client, userId);
        const entryId = await insertWord(
          client,
          `platform-known-stale-undo-${Date.now()}`,
        );

        const first = await client.query(
          `select perform_platform_v2_card_action(
            $1::uuid, 'mark-known', $2::uuid, $3::text, 'untracked',
            null, null, null, $4::uuid, null, 'first_party', null
          ) as result`,
          [userId, entryId, cardTypeId, randomUUID()],
        );
        const firstCard = first.rows[0].result.card;
        const cleared = await client.query(
          `select perform_platform_v2_card_action(
            $1::uuid, 'undo-known', $2::uuid, $3::text, $4::text,
            $5::uuid, $6::text, null, $7::uuid, null, 'first_party', null
          ) as result`,
          [
            userId,
            entryId,
            cardTypeId,
            firstCard.stateRevision,
            firstCard.knownMark.markId,
            firstCard.knownMark.revision,
            randomUUID(),
          ],
        );
        const duplicateUndo = await client.query(
          `select perform_platform_v2_card_action(
            $1::uuid, 'undo-known', $2::uuid, $3::text, $4::text,
            $5::uuid, $6::text, null, $7::uuid, null, 'first_party', null
          ) as result`,
          [
            userId,
            entryId,
            cardTypeId,
            firstCard.stateRevision,
            firstCard.knownMark.markId,
            firstCard.knownMark.revision,
            cleared.rows[0].result.clientEventId,
          ],
        );
        expect(duplicateUndo.rows[0].result).toEqual({
          ...cleared.rows[0].result,
          status: "duplicate",
        });

        const replacement = await client.query(
          `select perform_platform_v2_card_action(
            $1::uuid, 'mark-known', $2::uuid, $3::text, $4::text,
            null, null, null, $5::uuid, null, 'first_party', null
          ) as result`,
          [
            userId,
            entryId,
            cardTypeId,
            cleared.rows[0].result.card.stateRevision,
            randomUUID(),
          ],
        );

        await client.query("savepoint stale_undo");
        await expect(
          client.query(
            `select perform_platform_v2_card_action(
              $1::uuid, 'undo-known', $2::uuid, $3::text, $4::text,
              $5::uuid, $6::text, null, $7::uuid, null, 'first_party', null
            )`,
            [
              userId,
              entryId,
              cardTypeId,
              replacement.rows[0].result.card.stateRevision,
              firstCard.knownMark.markId,
              firstCard.knownMark.revision,
              randomUUID(),
            ],
          ),
        ).rejects.toThrow(/platform_known_mark_conflict/);
        await client.query("rollback to savepoint stale_undo");
        await client.query("release savepoint stale_undo");

        const active = await client.query(
          `select id
             from user_card_known_marks
            where user_id = $1
              and entry_id = $2
              and card_type_id = $3
              and cleared_at is null`,
          [userId, entryId, cardTypeId],
        );
        expect(active.rows).toEqual([
          { id: replacement.rows[0].result.card.knownMark.markId },
        ]);
      },
      userId,
    );
  });

  test("serializes competing Known Marks so exactly one becomes authoritative", async () => {
    const userId = randomUUID();
    let entryId: string | undefined;
    const setup = await pool.connect();
    try {
      await setup.query("begin");
      await ensureUserWithSettings(setup, userId);
      entryId = await insertWord(
        setup,
        `platform-known-concurrency-${Date.now()}`,
      );
      await setup.query("commit");
    } catch (error) {
      await setup.query("rollback");
      throw error;
    } finally {
      setup.release();
    }

    const attempt = async (clientEventId: string) => {
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query(
          `select set_config('request.jwt.claim.sub', $1, true)`,
          [userId],
        );
        const result = await client.query(
          `select perform_platform_v2_card_action(
            $1::uuid, 'mark-known', $2::uuid, $3::text, 'untracked',
            null, null, null, $4::uuid, null, 'first_party', null
          ) as result`,
          [userId, entryId, cardTypeId, clientEventId],
        );
        await client.query("commit");
        return result.rows[0].result;
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    };

    try {
      const outcomes = await Promise.allSettled([
        attempt(randomUUID()),
        attempt(randomUUID()),
      ]);
      const accepted = outcomes.filter(
        (outcome) => outcome.status === "fulfilled",
      );
      const rejected = outcomes.filter(
        (outcome) => outcome.status === "rejected",
      );

      expect(accepted).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(
        rejected[0].status === "rejected"
          ? String(rejected[0].reason)
          : "",
      ).toMatch(/platform_card_state_conflict/);

      const persisted = await pool.query(
        `select
           (select count(*)::int
              from user_card_known_marks
             where user_id = $1
               and entry_id = $2
               and card_type_id = $3
               and cleared_at is null) as active_marks,
           (select count(*)::int
              from user_card_action_events
             where user_id = $1
               and entry_id = $2
               and card_type_id = $3
               and action = 'mark-known') as events`,
        [userId, entryId, cardTypeId],
      );
      expect(persisted.rows).toEqual([{ active_marks: 1, events: 1 }]);
    } finally {
      await pool.query(`delete from auth.users where id = $1`, [userId]);
      if (entryId) {
        await pool.query(`delete from word_entries where id = $1`, [entryId]);
      }
    }
  });
});
