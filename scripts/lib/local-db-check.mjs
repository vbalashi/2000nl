import { readFileSync } from "node:fs";

// libpq accepts host overrides in URI query parameters. Only permit sslmode.
function validateTarget() {
  const url = new URL(process.env.LOCAL_SUPABASE_DB_URL);
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      !url.username || url.hash || !/^\/[a-zA-Z0-9_-]+$/.test(url.pathname) ||
      [...url.searchParams.keys()].some((key) => key !== "sslmode") ||
      url.searchParams.getAll("sslmode").length > 1 ||
      (url.searchParams.has("sslmode") &&
       !["disable", "prefer", "require"].includes(url.searchParams.get("sslmode")))) {
    throw new Error("Local DB commands require an unambiguous loopback PostgreSQL URL.");
  }
  if (process.argv[2] === "reset-target" &&
      ((url.port || "5432") !== "54322" || url.pathname !== "/postgres")) {
    throw new Error("Reset requires the canonical local Supabase database on port 54322.");
  }
}

function checkSql() {
  const contract = JSON.parse(readFileSync(
    new URL("../../packages/shared/deployment/db-contract.json", import.meta.url), "utf8",
  ));
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const expected = JSON.stringify(contract.migrations.map((migration) => ({
    migration_id: migration.migrationId,
    filename: migration.file,
    checksum_sha256: migration.sha256,
  })));
  return `
\\set ON_ERROR_STOP on
BEGIN READ ONLY;
SELECT 'dictionary_entries' AS check_name, count(*) AS value FROM public.word_entries
UNION ALL SELECT 'training_scope_entries', count(*) FROM private.default_training_scope_entries_v1
UNION ALL SELECT 'search_documents', count(*) FROM public.dictionary_search_documents
UNION ALL SELECT 'search_fields', count(*) FROM public.dictionary_search_fields
UNION ALL SELECT 'learner_card_states', count(*) FROM public.user_card_status
UNION ALL SELECT 'review_history_rows', count(*) FROM public.user_review_log;
DO $ledger$
BEGIN
  IF to_regclass('public.app_db_contract_migrations') IS NULL
     OR to_regclass('public.app_db_contract_state') IS NULL THEN
    RAISE EXCEPTION 'Local deployment ledger is absent. Preserve data and use the documented migration gate; do not insert a version marker manually.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(${quote(expected)}::jsonb)
      AS expected(migration_id int, filename text, checksum_sha256 text)
    LEFT JOIN public.app_db_contract_migrations actual USING (migration_id)
    WHERE actual.migration_id IS NULL OR actual.filename <> expected.filename
      OR actual.checksum_sha256 <> expected.checksum_sha256
  ) OR (SELECT count(*) FROM public.app_db_contract_migrations) <> ${contract.migrations.length}
    OR NOT EXISTS (SELECT 1 FROM public.app_db_contract_state
      WHERE singleton AND contract_id = ${quote(contract.contractId)}
        AND migration_id = ${contract.migrations.at(-1).migrationId}) THEN
    RAISE EXCEPTION 'Local migration receipts do not match the checkout. A health version marker alone is insufficient; preserve data and use the documented migration gate.';
  END IF;
END;
$ledger$;
COMMIT;
\\i db/scripts/local_supabase_probe.sql
\\i ${contract.postflightProbe}
`;
}

try {
  validateTarget();
  if (process.argv[2] === "sql") process.stdout.write(checkSql());
} catch (error) {
  // URL parser errors contain the input, potentially including credentials.
  process.stderr.write(`${error.code === "ERR_INVALID_URL"
    ? "Invalid local PostgreSQL URL."
    : error.message}\n`);
  process.exitCode = 1;
}
