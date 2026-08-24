import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const baseDatabaseUrl = process.env.ISSUE_238_BENCHMARK_BASE_DB_URL;
const qaUserId = "23800000-0000-0000-0000-000000000001";
const dictionaryId = "238d0000-0000-0000-0000-000000000001";
const entryCount = 18_184;
const nt2EntryCount = 4_031;

function postgresEnvironment(urlString) {
  const url = new URL(urlString);
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: url.searchParams.get("sslmode") ?? "disable",
  };
}

function psql(urlString, sql, extraArgs = []) {
  return spawnSync(
    "psql",
    ["-X", "--no-psqlrc", "-At", "--set=ON_ERROR_STOP=1", ...extraArgs],
    { input: sql, encoding: "utf8", env: postgresEnvironment(urlString) },
  );
}

function psqlProcess(urlString, sql) {
  const child = spawn("psql", ["-X", "--no-psqlrc", "-At", "--set=ON_ERROR_STOP=1"], {
    env: postgresEnvironment(urlString),
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.end(sql);
  return child;
}

function waitForMarker(child, marker) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${marker}`)), 5_000);
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.includes(marker)) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function assertLoopback(urlString) {
  const target = new URL(urlString);
  if (!["127.0.0.1", "localhost", "::1"].includes(target.hostname)) {
    throw new Error("Issue #238 integration accepts only a loopback PostgreSQL server");
  }
  return target;
}

function databaseUrl(baseUrl, databaseName) {
  const target = new URL(baseUrl);
  target.pathname = `/${databaseName}`;
  return target.toString();
}

function applySqlFile(targetUrl, relativePath) {
  const result = psql(targetUrl, "", ["--file", path.join(repoRoot, relativePath)]);
  assert.equal(result.status, 0, result.stderr);
}

function explainBuffers(plan) {
  const root = plan[0].Plan;
  return {
    hits: root["Shared Hit Blocks"] ?? 0,
    reads: root["Shared Read Blocks"] ?? 0,
  };
}

test(
  "the production-shaped session plan and next-card selector have bounded cold-I/O",
  { skip: !baseDatabaseUrl, timeout: 120_000 },
  async () => {
    const base = assertLoopback(baseDatabaseUrl);
    const databaseName = `issue238_${process.pid}_${Date.now()}`;
    const targetUrl = databaseUrl(base.toString(), databaseName);
    const quotedDatabaseName = `"${databaseName.replaceAll('"', '""')}"`;

    const create = psql(base.toString(), `CREATE DATABASE ${quotedDatabaseName};\n`);
    assert.equal(create.status, 0, create.stderr);

    try {
      const migrationSource = readFileSync(
        path.join(repoRoot, "db/migrations/127_bounded_training_session_plan_io.sql"),
        "utf8",
      );
      const lockOffset = migrationSource.indexOf(
        "LOCK TABLE public.word_entries IN SHARE ROW EXCLUSIVE MODE",
      );
      assert.ok(lockOffset >= 0);
      assert.ok(lockOffset < migrationSource.indexOf("CREATE TRIGGER sync_default_training_scope_entry_v1"));
      assert.ok(lockOffset < migrationSource.indexOf(
        "INSERT INTO private.default_training_scope_entries_v1",
        lockOffset,
      ));

      applySqlFile(targetUrl, "db/scripts/plain_postgres_supabase_compat.sql");
      applySqlFile(targetUrl, "db/migrations/bootstrap.sql");

      const seed = psql(
        targetUrl,
        `INSERT INTO auth.users (id, email)
         VALUES ('${qaUserId}', 'test@2000nl.test');

         INSERT INTO public.user_settings (
           user_id, subscription_tier, daily_new_limit, daily_review_limit, mix_mode
         ) VALUES ('${qaUserId}', 'free', 10, 200, 'mixed')
         ON CONFLICT (user_id) DO UPDATE SET
           daily_new_limit = EXCLUDED.daily_new_limit,
           daily_review_limit = EXCLUDED.daily_review_limit;

         INSERT INTO public.dictionaries (
           id, language_code, slug, name, kind, visibility, minimum_subscription_tier
         ) VALUES (
           '${dictionaryId}', 'nl', 'issue238-system', 'Issue 238 system',
           'curated', 'system', 'free'
         );

         INSERT INTO public.word_entries (
           dictionary_id, language_code, headword, meaning_id, part_of_speech,
           is_nt2_2000, raw
         )
         SELECT '${dictionaryId}', 'nl', 'issue238-entry-' || sample, sample, 'noun',
           mod(sample::bigint * ${nt2EntryCount}, ${entryCount}) < ${nt2EntryCount},
           jsonb_build_object('payload', (
             SELECT string_agg(md5(sample::text || ':' || chunk::text), '')
             FROM generate_series(1, 50) chunk
           ))
         FROM generate_series(1, ${entryCount}) sample;

         INSERT INTO public.user_card_status (user_id, entry_id, card_type_id)
         SELECT '${qaUserId}', id, 'word-to-definition'
         FROM public.word_entries
         WHERE is_nt2_2000
         ORDER BY meaning_id
         LIMIT 12;

         WITH ranked AS (
           SELECT status.entry_id,
             row_number() OVER (ORDER BY entry.meaning_id) AS ordinal
           FROM public.user_card_status status
           JOIN public.word_entries entry ON entry.id = status.entry_id
           WHERE status.user_id = '${qaUserId}'
         )
         UPDATE public.user_card_status status
         SET fsrs_enabled = ranked.ordinal <= 10,
           fsrs_last_interval = CASE
             WHEN ranked.ordinal <= 2 THEN 0.2
             WHEN ranked.ordinal <= 6 THEN 2
             ELSE 1
           END,
           next_review_at = CASE
             WHEN ranked.ordinal <= 6 THEN now() - interval '1 day'
             ELSE now() + interval '1 day'
           END,
           hidden = ranked.ordinal IN (9, 10)
         FROM ranked
         WHERE status.user_id = '${qaUserId}' AND status.entry_id = ranked.entry_id;

         INSERT INTO public.user_review_log (
           user_id, word_id, mode, grade, review_type, reviewed_at
         )
         SELECT '${qaUserId}', id, 'word-to-definition', 3, 'new', now()
         FROM public.word_entries
         WHERE meaning_id = 20;

         INSERT INTO public.user_card_status (
           user_id, entry_id, card_type_id, fsrs_enabled, hidden
         )
         SELECT '${qaUserId}', id, 'definition-to-word', false, false
         FROM public.word_entries
         WHERE meaning_id = 30;

         VACUUM (ANALYZE) public.word_entries;
         ANALYZE public.user_card_status;

         DO $$
         DECLARE fixture record;
         BEGIN
           SELECT count(*) entries,
             count(*) FILTER (WHERE is_nt2_2000) nt2_entries,
             round(avg(pg_column_size(entry))) avg_row_bytes,
             (SELECT email FROM auth.users WHERE id = '${qaUserId}') qa_email
           INTO fixture
           FROM public.word_entries entry;
           IF fixture.entries <> ${entryCount}
              OR fixture.nt2_entries <> ${nt2EntryCount}
              OR fixture.avg_row_bytes < 1500
              OR fixture.qa_email <> 'test@2000nl.test' THEN
             RAISE EXCEPTION 'issue238 fixture mismatch: %', row_to_json(fixture);
           END IF;
         END $$;\n`,
      );
      assert.equal(seed.status, 0, seed.stderr);

      const projectionSync = psql(
        targetUrl,
        `DO $$
         DECLARE target_id uuid;
         BEGIN
           IF (SELECT count(*) FROM private.default_training_scope_entries_v1) <> ${nt2EntryCount}
              OR EXISTS (
                SELECT 1
                FROM private.default_training_scope_entries_v1 projection
                JOIN public.word_entries entry ON entry.id = projection.entry_id
                WHERE NOT entry.is_nt2_2000
                   OR private.is_pointer_only_dictionary_entry_v1(entry.raw)
                   OR projection.dictionary_id IS DISTINCT FROM entry.dictionary_id
              ) THEN
             RAISE EXCEPTION 'issue238 initial scope projection mismatch';
           END IF;

           SELECT id INTO target_id
           FROM public.word_entries
           WHERE is_nt2_2000
           ORDER BY meaning_id
           LIMIT 1;
           UPDATE public.word_entries
           SET raw = raw || jsonb_build_object(
             'cross_reference', 'issue238-target', 'meanings', '[]'::jsonb
           )
           WHERE id = target_id;
           IF EXISTS (
             SELECT 1 FROM private.default_training_scope_entries_v1
             WHERE entry_id = target_id
           ) THEN
             RAISE EXCEPTION 'issue238 pointer projection was not removed';
           END IF;

           UPDATE public.word_entries
           SET raw = raw - 'cross_reference' - 'meanings'
           WHERE id = target_id;
           IF NOT EXISTS (
             SELECT 1 FROM private.default_training_scope_entries_v1
             WHERE entry_id = target_id
           ) THEN
             RAISE EXCEPTION 'issue238 trainable projection was not restored';
           END IF;
         END $$;\n`,
      );
      assert.equal(projectionSync.status, 0, projectionSync.stderr);

      const lockHolder = psqlProcess(
        targetUrl,
        `BEGIN;
         LOCK TABLE public.word_entries IN SHARE ROW EXCLUSIVE MODE;
         \\echo issue238-lock-ready
         SELECT pg_sleep(1);
         COMMIT;\n`,
      );
      let lockStderr = "";
      lockHolder.stderr.on("data", (chunk) => {
        lockStderr += chunk.toString();
      });
      const lockClose = once(lockHolder, "close");
      await waitForMarker(lockHolder, "issue238-lock-ready");

      const blockedWriter = psql(
        targetUrl,
        `SET statement_timeout = '100ms';
         UPDATE public.word_entries
         SET dictionary_id = dictionary_id
         WHERE id = (
           SELECT id FROM public.word_entries WHERE is_nt2_2000 ORDER BY meaning_id LIMIT 1
         );\n`,
      );
      assert.notEqual(blockedWriter.status, 0, "source writer unexpectedly bypassed migration lock");
      assert.match(blockedWriter.stderr, /statement timeout/i);
      const [lockExitCode] = await lockClose;
      assert.equal(lockExitCode, 0, lockStderr);

      const writerAfterCommit = psql(
        targetUrl,
        `UPDATE public.word_entries
         SET dictionary_id = dictionary_id
         WHERE id = (
           SELECT id FROM public.word_entries WHERE is_nt2_2000 ORDER BY meaning_id LIMIT 1
         );
         DO $$
         BEGIN
           IF (SELECT count(*) FROM private.default_training_scope_entries_v1) <> ${nt2EntryCount}
           THEN RAISE EXCEPTION 'issue238 projection stale after blocked writer retry';
           END IF;
         END $$;\n`,
      );
      assert.equal(writerAfterCommit.status, 0, writerAfterCommit.stderr);

      const parityEntry = psql(
        targetUrl,
        "SELECT id FROM public.word_entries WHERE meaning_id = 2;\n",
      );
      assert.equal(parityEntry.status, 0, parityEntry.stderr);
      const parityEntryId = parityEntry.stdout.trim();
      assert.match(parityEntryId, /^[0-9a-f-]{36}$/);
      const candidateSnapshot = (modes, cardFilter, excludedEntries, excludedCards) => {
        const snapshot = psql(
          targetUrl,
          `SELECT md5(COALESCE(jsonb_agg(jsonb_build_object(
             'entryId', candidate.entry_id,
             'cardTypeId', candidate.card_type_id,
             'queueSource', candidate.queue_source,
             'newToday', candidate.new_today,
             'dailyNewLimit', candidate.daily_new_limit,
             'newPoolSize', candidate.new_pool_size,
             'learningDueCount', candidate.learning_due_count,
             'reviewPoolSize', candidate.review_pool_size
           ) ORDER BY candidate.entry_id, candidate.card_type_id, candidate.queue_source)::text, '[]'))
           FROM private.training_scheduler_candidates_v1(
             '${qaUserId}', ${modes}, null, 'curated', '${cardFilter}', 'auto',
             ${excludedEntries}, ${excludedCards}, '{}', false
           ) candidate;\n`,
        );
        assert.equal(snapshot.status, 0, snapshot.stderr);
        return snapshot.stdout.trim();
      };
      const parityCases = [
        ["ARRAY['word-to-definition']", "both", "ARRAY[]::uuid[]", "ARRAY[]::text[]"],
        ["ARRAY['word-to-definition']", "new", "ARRAY[]::uuid[]", "ARRAY[]::text[]"],
        ["ARRAY['word-to-definition']", "review", `ARRAY['${parityEntryId}']::uuid[]`, "ARRAY[]::text[]"],
        [
          "ARRAY['word-to-definition','definition-to-word']",
          "both",
          "ARRAY[]::uuid[]",
          `ARRAY['${parityEntryId}:word-to-definition']::text[]`,
        ],
      ];
      applySqlFile(targetUrl, "db/migrations/126_set_based_scheduler_dictionary_access.sql");
      const legacyCandidates = parityCases.map((parityCase) => candidateSnapshot(...parityCase));
      applySqlFile(targetUrl, "db/migrations/128_bound_authoritative_next_card_selector.sql");
      const optimizedCandidates = parityCases.map((parityCase) => candidateSnapshot(...parityCase));
      assert.deepEqual(optimizedCandidates, legacyCandidates);

      const parity = psql(
        targetUrl,
        `BEGIN READ ONLY;
         SET LOCAL "request.jwt.claim.sub" = '${qaUserId}';
         WITH cases(label, modes, card_filter) AS (VALUES
           ('single-both', ARRAY['word-to-definition']::text[], 'both'),
           ('single-new', ARRAY['word-to-definition']::text[], 'new'),
           ('single-review', ARRAY['word-to-definition']::text[], 'review'),
           ('multi-both', ARRAY['word-to-definition', 'definition-to-word']::text[], 'both')
         ), compared AS (
           SELECT cases.label,
             optimized.planned_new AS optimized_new,
             optimized.planned_review AS optimized_review,
             optimized.planned_practice AS optimized_practice,
             COALESCE(legacy.planned_new, 0) AS legacy_new,
             COALESCE(legacy.planned_review, 0) AS legacy_review,
             COALESCE(legacy.planned_practice, 0) AS legacy_practice
           FROM cases
           CROSS JOIN LATERAL private.default_training_session_plan_counts_v1(
             '${qaUserId}', cases.modes, 'curated', cases.card_filter, '{}'
           ) optimized
           CROSS JOIN LATERAL (
             SELECT count(*) FILTER (WHERE queue_source = 'new') AS planned_new,
               count(*) FILTER (WHERE queue_source IN ('learning', 'review')) AS planned_review,
               count(*) FILTER (WHERE queue_source = 'practice') AS planned_practice
             FROM private.training_scheduler_candidates_v1(
               '${qaUserId}', cases.modes, null, 'curated', cases.card_filter,
               'auto', ARRAY[]::uuid[], ARRAY[]::text[], '{}', false
             )
           ) legacy
         )
         SELECT row_to_json(compared)
         FROM compared
         WHERE (optimized_new, optimized_review, optimized_practice)
           IS DISTINCT FROM (legacy_new, legacy_review, legacy_practice);
         ROLLBACK;\n`,
        ["--quiet"],
      );
      assert.equal(parity.status, 0, parity.stderr);
      assert.equal(parity.stdout.trim(), "", `optimized/legacy parity mismatch: ${parity.stdout}`);

      // Production imports can leave recently changed heap pages outside the
      // visibility map. Dirty every distributed NT2 row after the parity read
      // so the budget cannot depend on a just-VACUUMed ideal index-only scan.
      const dirtyVisibility = psql(
        targetUrl,
        `UPDATE public.word_entries
         SET dictionary_id = dictionary_id
         WHERE is_nt2_2000 = true;\n`,
      );
      assert.equal(dirtyVisibility.status, 0, dirtyVisibility.stderr);

      const explain = psql(
        targetUrl,
        `BEGIN READ ONLY;
         SELECT set_config('request.jwt.claim.sub', '${qaUserId}', true);
         SET LOCAL random_page_cost = 1.1;
         SET LOCAL effective_io_concurrency = 200;
         SET LOCAL jit = off;
         DISCARD PLANS;
         EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS, FORMAT JSON)
         SELECT public.get_training_session_plan(
           '${qaUserId}', ARRAY['word-to-definition'], null, 'curated', 'both', '{}'
         );
         ROLLBACK;\n`,
      );
      assert.equal(explain.status, 0, explain.stderr);
      const jsonStart = explain.stdout.indexOf("[");
      const jsonEnd = explain.stdout.lastIndexOf("]");
      assert.ok(jsonStart >= 0 && jsonEnd > jsonStart, `EXPLAIN JSON missing: ${explain.stdout}`);
      const plan = JSON.parse(explain.stdout.slice(jsonStart, jsonEnd + 1));
      const buffers = explainBuffers(plan);
      const totalBuffers = buffers.hits + buffers.reads;
      const executionMs = plan[0]["Execution Time"];
      assert.ok(
        totalBuffers <= 4_000 && executionMs <= 2_000,
        `session plan used ${executionMs}ms and touched ${totalBuffers} shared blocks ` +
          `(${buffers.hits} hit, ${buffers.reads} read); the budgets are 2,000ms and 4,000 blocks`,
      );

      const nextCardExplain = psql(
        targetUrl,
        `BEGIN READ ONLY;
         SELECT set_config('request.jwt.claim.sub', '${qaUserId}', true);
         SET LOCAL random_page_cost = 1.1;
         SET LOCAL effective_io_concurrency = 200;
         SET LOCAL jit = off;
         DISCARD PLANS;
         EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS, FORMAT JSON)
         SELECT * FROM public.get_next_card(
           '${qaUserId}', ARRAY['word-to-definition'], ARRAY[]::uuid[], null,
           'curated', 'both', 'auto', ARRAY[]::text[]
         );
         ROLLBACK;\n`,
      );
      assert.equal(nextCardExplain.status, 0, nextCardExplain.stderr);
      const nextCardJsonStart = nextCardExplain.stdout.indexOf("[");
      const nextCardJsonEnd = nextCardExplain.stdout.lastIndexOf("]");
      assert.ok(
        nextCardJsonStart >= 0 && nextCardJsonEnd > nextCardJsonStart,
        `next-card EXPLAIN JSON missing: ${nextCardExplain.stdout}`,
      );
      const nextCardPlan = JSON.parse(
        nextCardExplain.stdout.slice(nextCardJsonStart, nextCardJsonEnd + 1),
      );
      const nextCardBuffers = explainBuffers(nextCardPlan);
      const nextCardTotalBuffers = nextCardBuffers.hits + nextCardBuffers.reads;
      const nextCardExecutionMs = nextCardPlan[0]["Execution Time"];

      const measureComponent = (statement) => {
        const componentExplain = psql(
          targetUrl,
          `BEGIN READ ONLY;
           SET LOCAL jit = off;
           EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${statement};
           ROLLBACK;\n`,
        );
        assert.equal(componentExplain.status, 0, componentExplain.stderr);
        const componentJsonStart = componentExplain.stdout.indexOf("[");
        const componentJsonEnd = componentExplain.stdout.lastIndexOf("]");
        assert.ok(componentJsonStart >= 0 && componentJsonEnd > componentJsonStart);
        const componentPlan = JSON.parse(
          componentExplain.stdout.slice(componentJsonStart, componentJsonEnd + 1),
        );
        const componentBuffers = explainBuffers(componentPlan);
        return {
          blocks: componentBuffers.hits + componentBuffers.reads,
          ms: componentPlan[0]["Execution Time"],
        };
      };
      const fixtureEntry = psql(
        targetUrl,
        "SELECT id FROM public.word_entries WHERE meaning_id = 1;\n",
      );
      assert.equal(fixtureEntry.status, 0, fixtureEntry.stderr);
      const fixtureEntryId = fixtureEntry.stdout.trim();
      assert.match(fixtureEntryId, /^[0-9a-f-]{36}$/);
      const componentMetrics = [
        measureComponent(`SELECT * FROM private.training_scheduler_candidates_v1(
          '${qaUserId}', ARRAY['word-to-definition'], null, 'curated', 'both',
          'auto', ARRAY[]::uuid[], ARRAY[]::text[], '{}', false
        ) ORDER BY selection_order LIMIT 1`),
        measureComponent(`SELECT private.project_training_scheduler_candidate_v1(
          '${qaUserId}', '${fixtureEntryId}',
          'word-to-definition', 'new', '{}', false, 0, 10, 10, 0, 0
        )`),
        measureComponent("SELECT private.pointer_only_dictionary_entry_ids_v1()"),
      ];
      assert.ok(
        nextCardTotalBuffers <= 4_000 && nextCardExecutionMs <= 2_000,
        `next-card selector used ${nextCardExecutionMs}ms and touched ` +
          `${nextCardTotalBuffers} shared blocks (${nextCardBuffers.hits} hit, ` +
          `${nextCardBuffers.reads} read); components scheduler/project/pointer=` +
          `${JSON.stringify(componentMetrics)}; the budgets are 2,000ms and 4,000 blocks`,
      );

      applySqlFile(targetUrl, "db/deploy-contract/ledger-v1.sql");
      applySqlFile(targetUrl, "db/deploy-contract/postflight-128.sql");

      const triggerDrift = psql(
        targetUrl,
        `DROP TRIGGER sync_default_training_scope_entry_v1 ON public.word_entries;
         CREATE TRIGGER sync_default_training_scope_entry_v1
         AFTER INSERT ON public.word_entries
         FOR EACH ROW EXECUTE FUNCTION private.sync_default_training_scope_entry_v1();\n`,
      );
      assert.equal(triggerDrift.status, 0, triggerDrift.stderr);
      const triggerDriftPostflight = psql(
        targetUrl,
        "",
        ["--file", path.join(repoRoot, "db/deploy-contract/postflight-128.sql")],
      );
      assert.notEqual(triggerDriftPostflight.status, 0);
      assert.match(triggerDriftPostflight.stderr, /bounded-scope-sync-contract/);

      applySqlFile(targetUrl, "db/migrations/127_bounded_training_session_plan_io.sql");
      const functionDrift = psql(
        targetUrl,
        `ALTER FUNCTION private.sync_default_training_scope_entry_v1() SECURITY INVOKER;\n`,
      );
      assert.equal(functionDrift.status, 0, functionDrift.stderr);
      const functionDriftPostflight = psql(
        targetUrl,
        "",
        ["--file", path.join(repoRoot, "db/deploy-contract/postflight-128.sql")],
      );
      assert.notEqual(functionDriftPostflight.status, 0);
      assert.match(functionDriftPostflight.stderr, /bounded-scope-sync-function-contract/);

      applySqlFile(targetUrl, "db/migrations/127_bounded_training_session_plan_io.sql");
      applySqlFile(targetUrl, "db/deploy-contract/postflight-128.sql");

      applySqlFile(targetUrl, "db/migrations/126_set_based_scheduler_dictionary_access.sql");
      const schedulerDriftPostflight = psql(
        targetUrl,
        "",
        ["--file", path.join(repoRoot, "db/deploy-contract/postflight-128.sql")],
      );
      assert.notEqual(schedulerDriftPostflight.status, 0);
      assert.match(schedulerDriftPostflight.stderr, /bounded-selector-contract/);

      applySqlFile(targetUrl, "db/migrations/128_bound_authoritative_next_card_selector.sql");
      applySqlFile(targetUrl, "db/deploy-contract/postflight-128.sql");
    } finally {
      const terminate = psql(
        base.toString(),
        `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
         WHERE datname = '${databaseName}' AND pid <> pg_backend_pid();
         DROP DATABASE IF EXISTS ${quotedDatabaseName};\n`,
      );
      assert.equal(terminate.status, 0, terminate.stderr);
    }
  },
);
