#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v node >/dev/null || { echo 'Install Node.js.' >&2; exit 1; }
command -v psql >/dev/null || { echo 'Install a PostgreSQL client (psql).' >&2; exit 1; }
# This address belongs exclusively to the public checkout's local stack.
# Do not accept a generic DATABASE_URL that could target a different service.
target='postgresql://postgres:postgres@127.0.0.1:55322/postgres'
unset PGHOSTADDR PGSERVICE PGSERVICEFILE
present="$(psql "$target" -X -At -v ON_ERROR_STOP=1 -c "select to_regclass('public.word_entries') is not null")"
if [[ "$present" != f ]]; then
  echo 'Application schema already exists. Bootstrap refused; no database was reset.' >&2
  exit 1
fi
node - <<'JS'
const fs=require('node:fs');const crypto=require('node:crypto');
const c=JSON.parse(fs.readFileSync('packages/shared/deployment/db-contract.json','utf8'));
const hash=crypto.createHash('sha256').update(fs.readFileSync(c.baseline.file)).digest('hex');
if(hash!==c.baseline.sha256)throw new Error('Baseline checksum mismatch');
JS
psql "$target" -X -v ON_ERROR_STOP=1 -f db/migrations/bootstrap.sql
psql "$target" -X -v ON_ERROR_STOP=1 -f db/test-fixtures/search_multisource.sql
psql "$target" -X -v ON_ERROR_STOP=1 -f db/test-fixtures/training_smoke.sql
# Demo entries need the same derived search documents as imported entries.
psql "$target" -X -v ON_ERROR_STOP=1 -c "SELECT public.refresh_dictionary_search_document(id, 2) FROM public.word_entries" >/dev/null
psql "$target" -X -v ON_ERROR_STOP=1 -f db/deploy-contract/postflight-288.sql
read -r contract_id migration_id < <(node -e 'const c=require("./packages/shared/deployment/db-contract.json");process.stdout.write(c.contractId+" "+(c.migrations.at(-1)?.migrationId??c.baseline.migrationId)+"\n")')
[[ "$contract_id" =~ ^[a-z0-9-]+$ && "$migration_id" =~ ^[0-9]+$ ]]
app_commit=0000000000000000000000000000000000000000
if [[ -e .git ]]; then app_commit="$(git rev-parse --verify HEAD)"; fi
[[ "$app_commit" =~ ^[0-9a-f]{40}$ ]]
psql "$target" -X -v ON_ERROR_STOP=1 -v contract_id="$contract_id" -v migration_id="$migration_id" -v app_commit="$app_commit" <<'SQL'
INSERT INTO public.app_db_contract_state(singleton,contract_id,migration_id,app_commit)
VALUES(true,:'contract_id',:migration_id,:'app_commit');
SQL
echo 'Verified local application schema and synthetic demo fixture loaded.'
