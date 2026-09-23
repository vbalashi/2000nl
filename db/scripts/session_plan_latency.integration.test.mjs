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

const planStatement = `SELECT public.get_training_session_plan(
  '${qaUserId}', ARRAY['word-to-definition'], NULL, 'curated', 'both', '{}'
)`;

function measure(targetUrl) {
  // Every call gets a new backend, so function/query caches from earlier
  // samples cannot turn the first-call regression into a warm-only test.
  const result = psql(targetUrl, `DISCARD PLANS; BEGIN READ ONLY;
    SET LOCAL statement_timeout = '2000ms';
    SET LOCAL jit = off;
    SET LOCAL work_mem = '2184kB';
    SELECT set_config('request.jwt.claim.sub', '${qaUserId}', true);
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${planStatement};
    ROLLBACK;`);
  assert.equal(result.status, 0, result.stderr);
  const start = result.stdout.indexOf('[');
  const end = result.stdout.lastIndexOf(']') + 1;
  const [explain] = JSON.parse(result.stdout.slice(start, end));
  return {
    executionMs: explain['Execution Time'],
    planningMs: explain['Planning Time'],
    hits: explain.Plan['Shared Hit Blocks'],
    reads: explain.Plan['Shared Read Blocks'],
    tempReads: explain.Plan['Temp Read Blocks'],
    tempWrites: explain.Plan['Temp Written Blocks'],
  };
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


      const sourceShape = psql(targetUrl, `INSERT INTO private.dictionary_import_runs(id,dictionary_id,identity_scheme_version,artifact_format_version,manifest_checksum,input_checksum,source_record_count,artifact_count,status) VALUES('41300000-0000-0000-0000-000000000001','413d0000-0000-0000-0000-000000000001','fixture','fixture','fixture','fixture',18184,18184,'completed');
INSERT INTO private.source_entry_bindings(dictionary_id,identity_scheme_version,source_entry_key,source_group_key,sense_ordinal,word_entry_id,binding_state,first_seen_run_id,last_seen_run_id,manifest_checksum,content_fingerprint_version,content_fingerprint,identity_evidence,reconciliation_decision)
SELECT dictionary_id,'fixture',id::text,headword,1,id,'active','41300000-0000-0000-0000-000000000001','41300000-0000-0000-0000-000000000001','fixture','fixture','fixture','{}','{}' FROM public.word_entries;
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
