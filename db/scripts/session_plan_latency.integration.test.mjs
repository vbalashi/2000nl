import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const baseDatabaseUrl = process.env.SESSION_PLAN_BENCHMARK_BASE_DB_URL;
const qaUserId = "41300000-0000-0000-0000-000000000001";
const dictionaryId = "413d0000-0000-0000-0000-000000000001";
const entryCount = 18_184;
const nt2EntryCount = 4_031;

function postgresEnvironment(urlString) {
  const url = new URL(urlString);
  return {
    ...process.env,
    PGHOST: url.hostname,
    PGHOSTADDR: url.hostname === "localhost" ? "127.0.0.1" : url.hostname.replace(/[\[\]]/g, ""),
    PGCONNECT_TIMEOUT: "5",
    PGOPTIONS: "",
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
    { input: sql, encoding: "utf8", cwd: repoRoot, timeout: 60_000, env: postgresEnvironment(urlString) },
  );
}


function applySqlFile(targetUrl, relativePath) {
  const result = psql(targetUrl, "", ["--file", path.join(repoRoot, relativePath)]);
  assert.equal(result.status, 0, result.stderr);
}

function parseFirstJsonArray(output, offset = 0) {
  const start = output.indexOf("[", offset);
  assert.notEqual(start, -1, `JSON array missing from ${JSON.stringify(output)}`);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < output.length; index += 1) {
    const character = output[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === "[") {
      depth += 1;
    } else if (character === "]") {
      depth -= 1;
      if (depth === 0) return JSON.parse(output.slice(start, index + 1));
    }
  }
  assert.fail(`Unterminated JSON array in ${JSON.stringify(output)}`);
}

const functionStatsSql = `SELECT COALESCE(
  json_agg(json_build_object(
    'functionId', stats.funcid,
    'schema', stats.schemaname,
    'function', stats.funcname,
    'argumentTypes', oidvectortypes(procedure.proargtypes),
    'calls', calls,
    'totalMs', round(total_time::numeric, 3),
    'selfMs', round(self_time::numeric, 3)
  ) ORDER BY total_time DESC)::text,
  '[]'
)
FROM pg_stat_user_functions stats
JOIN pg_proc procedure ON procedure.oid = stats.funcid
WHERE stats.calls > 0
  AND (stats.funcname LIKE '%training%' OR stats.funcname LIKE '%schedule%');`;

function readFunctionStats(targetUrl) {
  const result = psql(targetUrl, `SELECT pg_stat_clear_snapshot(); ${functionStatsSql}`);
  assert.equal(result.status, 0, result.stderr);
  return parseFirstJsonArray(result.stdout);
}

const planStatements = {
  public: `SELECT public.get_training_session_plan(
  '${qaUserId}', ARRAY['word-to-definition'], NULL, 'curated', 'both', '{}'
  )`,
  uiPublic: `SELECT public.get_training_session_plan(
    '${qaUserId}', ARRAY['word-to-definition'], NULL, 'curated', 'both', '{}', '10', 2
  )`,
};

function measure(targetUrl, statement = planStatements.public, { functionStats = false } = {}) {
  // Every call gets a new backend, so function/query caches from earlier
  // samples cannot turn the first-call regression into a warm-only test.
  const statsBeforeRows = functionStats ? readFunctionStats(targetUrl) : [];
  const result = psql(targetUrl, `DISCARD PLANS; BEGIN READ ONLY;
    SET LOCAL statement_timeout = '2000ms';
    SET LOCAL jit = off;
    SET LOCAL work_mem = '2184kB';
    SELECT set_config('request.jwt.claim.sub', '${qaUserId}', true);
    SET LOCAL track_functions = 'all';
    SELECT 'EXPLAIN_START';
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${statement};
    ROLLBACK;`);
  assert.equal(result.status, 0, result.stderr);
  const explainMarker = result.stdout.indexOf('EXPLAIN_START');
  assert.notEqual(explainMarker, -1, `EXPLAIN marker missing from ${JSON.stringify(result.stdout)}`);
  const [explain] = parseFirstJsonArray(result.stdout, explainMarker);
  const statsAfterRows = functionStats ? readFunctionStats(targetUrl) : [];
  const statsBeforeByFunction = new Map(
    statsBeforeRows.map((row) => [row.functionId, row]),
  );
  const functionStatsDelta = statsAfterRows
    .map((row) => {
      const before = statsBeforeByFunction.get(row.functionId) ?? {
        calls: 0,
        totalMs: 0,
        selfMs: 0,
      };
      return {
        ...row,
        calls: row.calls - before.calls,
        totalMs: Number((row.totalMs - before.totalMs).toFixed(3)),
        selfMs: Number((row.selfMs - before.selfMs).toFixed(3)),
      };
    })
    .filter((row) => row.calls > 0);
  return {
    executionMs: explain['Execution Time'],
    planningMs: explain['Planning Time'],
    hits: explain.Plan['Shared Hit Blocks'],
    reads: explain.Plan['Shared Read Blocks'],
    tempReads: explain.Plan['Temp Read Blocks'],
    tempWrites: explain.Plan['Temp Written Blocks'],
    functionStats: functionStats ? functionStatsDelta : undefined,
  };
}

function candidateDigest(targetUrl, trainingFilter = '{}') {
  const result = psql(targetUrl, `BEGIN READ ONLY;
    SET LOCAL jit = off;
    SELECT set_config('request.jwt.claim.sub', '${qaUserId}', true);
    SELECT md5(COALESCE(string_agg(
      concat_ws('|', entry_id, card_type_id, queue_source, new_today,
        daily_new_limit, new_pool_size, learning_due_count, review_pool_size),
      ',' ORDER BY entry_id, card_type_id, queue_source
    ), ''))
    FROM private.training_scheduler_candidates_v2(
      '${qaUserId}', ARRAY['word-to-definition']::text[], NULL,
      'curated', 'both', 'auto', ARRAY[]::uuid[], ARRAY[]::text[],
      '${trainingFilter}'::jsonb, false, true
    );
    ROLLBACK;`);
  assert.equal(result.status, 0, result.stderr);
  const match = result.stdout.match(/\b[a-f0-9]{32}\b/);
  assert.ok(match, `candidate digest missing from ${JSON.stringify(result.stdout)}`);
  return match[0];
}

function assertNestedFunctionTiming(sample, wrapperArgumentTypes) {
  const expected = [
    ["public", "get_training_session_plan", wrapperArgumentTypes],
    ["private", "training_scheduler_candidates_v2",
      "uuid, text[], uuid, text, text, text, uuid[], text[], jsonb, boolean, boolean"],
  ];
  for (const [schema, name, argumentTypes] of expected) {
    const matching = sample.functionStats.filter((row) =>
      row.schema === schema && row.function === name &&
      row.argumentTypes === argumentTypes && row.calls > 0,
    );
    assert.equal(matching.length, 1,
      `Missing or ambiguous function timing for ${schema}.${name}(${argumentTypes}): ${JSON.stringify(sample.functionStats)}`);
  }
}

test('current public session plan and exact deployment probe stay bounded on a dirty wide corpus',
  { skip: !baseDatabaseUrl, timeout: 120_000 }, (t) => {
    const base = new URL(baseDatabaseUrl);
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname),
      'Session-plan integration accepts only loopback PostgreSQL');
    const databaseName = `issue413_${process.pid}_${Date.now()}`;
    const target = new URL(base);
    target.pathname = `/${databaseName}`;
    const targetUrl = target.toString();
    assert.equal(psql(base.toString(), `CREATE DATABASE "${databaseName}"`).status, 0);
    try {
      applySqlFile(targetUrl, 'db/scripts/plain_postgres_supabase_compat.sql');
      applySqlFile(targetUrl, 'db/migrations/bootstrap.sql');
      // The disposable fixture compares the last pre-optimization candidate
      // contract with migration 159. Re-apply only its prior function owner;
      // migration 158's scope security boundary remains intact.
      applySqlFile(targetUrl, 'db/migrations/157_ordinary_training_lexical_candidate_filters.sql');
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
         SELECT '${dictionaryId}', 'nl', 'issue238-entry-' || sample, sample,
           CASE WHEN mod(sample, 5) = 0 THEN 'bn' ELSE 'noun' END,
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


      const sourceShape = psql(targetUrl, `INSERT INTO private.dictionary_import_runs(id,dictionary_id,identity_scheme_version,artifact_format_version,manifest_checksum,input_checksum,source_record_count,artifact_count,status) VALUES('41300000-0000-0000-0000-000000000001','413d0000-0000-0000-0000-000000000001','fixture','fixture','fixture','fixture',18184,18184,'completed');
INSERT INTO private.source_entry_bindings(dictionary_id,identity_scheme_version,source_entry_key,source_group_key,sense_ordinal,word_entry_id,binding_state,first_seen_run_id,last_seen_run_id,manifest_checksum,content_fingerprint_version,content_fingerprint,identity_evidence,reconciliation_decision)
SELECT dictionary_id,'fixture',id::text,headword,1,id,'active','41300000-0000-0000-0000-000000000001','41300000-0000-0000-0000-000000000001','fixture','fixture','fixture','{}','{}' FROM public.word_entries;
-- Entry 5 belongs to the NT2 scope, but its ordinary predecessor (entry 1)
-- does not. A safe scope-group optimization must retain that predecessor.
UPDATE private.source_entry_bindings binding
SET source_group_key = 'fixture-cross-scope-pair',
    sense_ordinal = CASE WHEN entry.meaning_id = 1 THEN 1 ELSE 2 END
FROM public.word_entries entry
WHERE binding.word_entry_id = entry.id AND entry.meaning_id IN (1, 5);
-- Fixture bulk loading only: all entries have both root nodes, so the
-- exceptional unrenderable projection correctly stays empty. Avoid the
-- unrelated import reconciliation cost; restore triggers before reads.
BEGIN;
SET LOCAL session_replication_role=replica;
INSERT INTO private.platform_v2_content_nodes(entry_id,kind,binding_state,first_source_revision,last_source_revision,source_text_fingerprint,diagnostic_locator)
SELECT e.id,k,'active','fixture','fixture',e.id::text,k FROM public.word_entries e CROSS JOIN unnest(ARRAY['definition','example']) k;
COMMIT;
ANALYZE private.source_entry_bindings;
ANALYZE private.platform_v2_content_nodes;`);
      assert.equal(sourceShape.status, 0, sourceShape.stderr);

      const predecessorParity = psql(targetUrl, `WITH scope_ids AS MATERIALIZED (
  SELECT entry_id FROM private.default_training_scope_entries_v1
), scope_groups AS MATERIALIZED (
  SELECT DISTINCT binding.dictionary_id, binding.identity_scheme_version,
    binding.source_group_key
  FROM scope_ids scope
  JOIN private.source_entry_bindings binding
    ON binding.word_entry_id = scope.entry_id
   AND binding.binding_state = 'active'
), ordinary_rows AS MATERIALIZED (
  SELECT binding.word_entry_id, binding.dictionary_id,
    binding.identity_scheme_version, binding.source_group_key,
    binding.sense_ordinal
  FROM private.source_entry_bindings binding
  JOIN private.platform_v2_content_nodes definition
    ON definition.entry_id = binding.word_entry_id
   AND definition.binding_state = 'active'
   AND definition.parent_content_node_id IS NULL
   AND definition.kind = 'definition'
  LEFT JOIN private.unrenderable_ordinary_direct_entries_v1 unrenderable
    ON unrenderable.entry_id = binding.word_entry_id
  WHERE binding.binding_state = 'active'
    AND unrenderable.entry_id IS NULL
), global_introductions AS MATERIALIZED (
  SELECT word_entry_id,
    lag(word_entry_id) OVER (
      PARTITION BY dictionary_id, identity_scheme_version, source_group_key
      ORDER BY sense_ordinal, word_entry_id
    ) predecessor_entry_id
  FROM ordinary_rows
), scoped_introductions AS MATERIALIZED (
  SELECT row.word_entry_id,
    lag(row.word_entry_id) OVER (
      PARTITION BY row.dictionary_id, row.identity_scheme_version,
        row.source_group_key
      ORDER BY row.sense_ordinal, row.word_entry_id
    ) predecessor_entry_id
  FROM ordinary_rows row
  JOIN scope_groups group_key
    ON group_key.dictionary_id = row.dictionary_id
   AND group_key.identity_scheme_version = row.identity_scheme_version
   AND group_key.source_group_key = row.source_group_key
)
SELECT json_build_object(
  'globalRows', (SELECT count(*) FROM global_introductions),
  'scopedRows', (SELECT count(*) FROM scoped_introductions),
  'mismatches', (
    SELECT count(*) FROM scope_ids scope
    LEFT JOIN global_introductions original
      ON original.word_entry_id = scope.entry_id
    LEFT JOIN scoped_introductions narrowed
      ON narrowed.word_entry_id = scope.entry_id
    WHERE original.predecessor_entry_id IS DISTINCT FROM narrowed.predecessor_entry_id
  ),
  'outsideScopePredecessors', (
    SELECT count(*) FROM scope_ids scope
    JOIN global_introductions original
      ON original.word_entry_id = scope.entry_id
    LEFT JOIN scope_ids predecessor
      ON predecessor.entry_id = original.predecessor_entry_id
    WHERE original.predecessor_entry_id IS NOT NULL
      AND predecessor.entry_id IS NULL
  )
)::text;`);
      assert.equal(predecessorParity.status, 0, predecessorParity.stderr);
      const parity = JSON.parse(predecessorParity.stdout.trim());
      t.diagnostic(JSON.stringify({ predecessorParity: parity }));
      assert.equal(parity.mismatches, 0);
      assert.ok(parity.outsideScopePredecessors > 0);
      assert.ok(parity.scopedRows < parity.globalRows / 2);

      // Invalidate visibility on distributed source and projection pages.
      // This models import/update churn; it does not claim to evict OS caches.
      const dirty = psql(targetUrl, `
        UPDATE public.word_entries SET raw = raw || '{"changed":true}'::jsonb
        WHERE is_nt2_2000;
        UPDATE private.default_training_scope_entries_v1
        SET dictionary_id = dictionary_id;
        ANALYZE public.word_entries;
        ANALYZE private.default_training_scope_entries_v1;`);
      assert.equal(dirty.status, 0, dirty.stderr);

      const samples = Array.from({ length: 3 }, () => measure(targetUrl));
      t.diagnostic(JSON.stringify({ sourceEntries: entryCount, nt2Entries: nt2EntryCount, samples }));
      for (const sample of samples) {
        assert.ok(sample.executionMs <= 2000, JSON.stringify(sample));
        // Measured ~5,000 blocks with source bindings/root content; 6,500
        // leaves catalog/planner variation headroom. The historical v1
        // test's separate 4,000-block bound is deliberately unchanged.
        assert.ok(sample.hits + sample.reads <= 6500,
          `current public plan buffer budget exceeded: ${JSON.stringify(sample)}`);
      }

      const originalCandidates = candidateDigest(targetUrl);
      const adjectiveCandidates = candidateDigest(targetUrl, '{"partOfSpeech":["bn"]}');
      assert.notEqual(adjectiveCandidates, 'd41d8cd98f00b204e9800998ecf8427e',
        'lexical filter fixture must select at least one card');
      applySqlFile(targetUrl, 'db/migrations/159_scope_ordinary_source_introductions.sql');
      applySqlFile(targetUrl, 'db/deploy-contract/postflight-159.sql');
      const optimizedCandidates = candidateDigest(targetUrl);
      assert.equal(optimizedCandidates, originalCandidates,
        'scope-group optimization changed candidate membership or diagnostics');
      assert.equal(candidateDigest(targetUrl, '{"partOfSpeech":["bn"]}'), adjectiveCandidates,
        'scope-group optimization changed adjective-filtered candidates');
      applySqlFile(targetUrl, 'db/migrations/160_training_dictionary_material_scope.sql');
      applySqlFile(targetUrl, 'db/deploy-contract/postflight-160.sql');
      assert.equal(candidateDigest(targetUrl), originalCandidates,
        'dictionary material support changed legacy candidate membership or diagnostics');
      assert.equal(candidateDigest(targetUrl, '{"partOfSpeech":["bn"]}'), adjectiveCandidates,
        'dictionary material support changed adjective-filtered candidates');
      const dictionaryPlan = `SELECT public.get_training_session_plan(
        '${qaUserId}', ARRAY['word-to-definition'], NULL, 'curated', 'both',
        '{"dictionaryScope":{"mode":"all","languageCode":"nl"}}'::jsonb, '10', 2
      )`;
      const dictionaryMaterialSamples = Array.from({ length: 3 }, () =>
        measure(targetUrl, dictionaryPlan));
      t.diagnostic(JSON.stringify({ dictionaryMaterialSamples }));
      for (const sample of dictionaryMaterialSamples) {
        assert.ok(sample.executionMs <= 10_000,
          `dictionary material plan exceeded the interactive safety bound: ${JSON.stringify(sample)}`);
      }
      const optimizedSamples = Array.from({ length: 3 }, () => measure(targetUrl));
      t.diagnostic(JSON.stringify({ optimizedSamples }));
      for (const sample of optimizedSamples) {
        assert.ok(sample.executionMs <= 2000, JSON.stringify(sample));
        assert.ok(sample.hits + sample.reads <= 6500,
          `scope-group candidate buffer budget exceeded: ${JSON.stringify(sample)}`);
      }

      // Keep nested PL/pgSQL timing on the disposable fixture.  This uses a
      // fresh backend for each call and records only aggregate function names,
      // call counts, and durations; it does not expose learner or card data.
      const nestedTiming = {
        public: measure(targetUrl, planStatements.public, { functionStats: true }),
        uiPublic: measure(targetUrl, planStatements.uiPublic, { functionStats: true }),
      };
      t.diagnostic(JSON.stringify({ nestedTiming }));
      assert.ok(nestedTiming.public.executionMs <= 2000, JSON.stringify(nestedTiming));
      assert.ok(nestedTiming.uiPublic.executionMs <= 2000, JSON.stringify(nestedTiming));
      assertNestedFunctionTiming(nestedTiming.public,
        "uuid, text[], uuid, text, text, jsonb");
      assertNestedFunctionTiming(nestedTiming.uiPublic,
        "uuid, text[], uuid, text, text, jsonb, text, integer");
      const manifest = JSON.parse(readFileSync(
        path.join(repoRoot, 'packages/shared/deployment/db-contract.json'), 'utf8'));
      const shape = psql(targetUrl, `BEGIN READ ONLY;
        SET LOCAL statement_timeout = '${manifest.preSwitchReadProbe.statementTimeoutMs}ms';
        SET LOCAL jit = off;
    SET LOCAL work_mem = '2184kB';
        SELECT set_config('request.jwt.claim.sub', '${qaUserId}', true);
        DO $check$
        DECLARE plan jsonb;
        BEGIN
          SELECT public.get_training_session_plan(
            '${qaUserId}', ARRAY['word-to-definition'], NULL, 'curated', 'both', '{}'
          ) INTO plan;
          IF (plan->>'plannedNew')::int < 3900
             OR (plan->>'plannedReview')::int <> 6
             OR (plan->>'plannedPractice')::int <> 2 THEN
            RAISE EXCEPTION 'fixture does not exercise populated queues: %', plan;
          END IF;
        END $check$;
        ROLLBACK;`);
      assert.equal(shape.status, 0, shape.stderr);
      // Keep this connection separate: shape validation must not warm the
      // public function immediately before the deployment probe.
      const probe = psql(targetUrl, `DISCARD PLANS;
        BEGIN READ ONLY;
        SET LOCAL statement_timeout = '${manifest.preSwitchReadProbe.statementTimeoutMs}ms';
        SET LOCAL jit = off;
        SET LOCAL work_mem = '2184kB';
        \\i ${manifest.preSwitchReadProbe.file}
        ROLLBACK;`);
      assert.equal(probe.status, 0, probe.stderr);

      // Prove the feedback loop goes red on the exact timeout symptom.
      // This injected delay exists only in the disposable database, after
      // the real current-contract measurements; it is not a cause claim.
      const slow = psql(targetUrl, `CREATE OR REPLACE FUNCTION
        public.get_training_session_plan(
          p_user_id uuid,
          p_card_type_ids text[] DEFAULT ARRAY['word-to-definition'],
          p_list_id uuid DEFAULT NULL,
          p_list_type text DEFAULT 'curated',
          p_card_filter text DEFAULT 'both',
          p_training_filter jsonb DEFAULT '{}')
        RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
        SET search_path = public, private, pg_temp AS $slow$
        BEGIN PERFORM pg_sleep(2.1); RETURN '{}'::jsonb; END $slow$;`);
      assert.equal(slow.status, 0, slow.stderr);
      assert.throws(() => measure(targetUrl), /statement timeout/);
    } finally {
      const cleanup = psql(base.toString(), `DROP DATABASE "${databaseName}" WITH (FORCE);`);
      assert.equal(cleanup.status, 0, cleanup.stderr);
    }
  });
