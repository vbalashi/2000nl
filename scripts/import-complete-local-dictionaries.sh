#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
database_url="${SUPABASE_DB_URL:-${LOCAL_SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}}"
python_bin="${PYTHON:-$repo_root/.venv/bin/python}"

if [[ ! -x "$python_bin" ]]; then
  echo "Ingestion Python environment is missing: $python_bin" >&2
  echo "Run scripts/bootstrap-worktree.sh --install --ingestion first." >&2
  exit 1
fi

cd "$repo_root"
PYTHONPATH="$repo_root/packages/ingestion/src${PYTHONPATH:+:$PYTHONPATH}" \
  "$python_bin" packages/ingestion/scripts/generate_complete_fixture_dictionaries.py

import_dictionary() {
  local data_dir="$1"
  local language_code="$2"
  local language_name="$3"
  local dictionary_slug="$4"
  local dictionary_name="$5"
  local list_slug="$6"
  local list_name="$7"
  local schema_key="$8"

  PYTHONPATH="$repo_root/packages/ingestion/src${PYTHONPATH:+:$PYTHONPATH}" \
    "$python_bin" packages/ingestion/scripts/import_words_db.py \
      --database-url "$database_url" \
      --data-dir "$data_dir" \
      --language "$language_code" \
      --language-name "$language_name" \
      --dictionary-slug "$dictionary_slug" \
      --dictionary-name "$dictionary_name" \
      --dictionary-description "Synthetic local fixture for multilingual dictionary and training QA." \
      --dictionary-schema-key "$schema_key" \
      --dictionary-source-provider local-fixture \
      --dictionary-source-version 2026-09-20 \
      --list-slug "$list_slug" \
      --list-name "$list_name" \
      --list-description "All entries from the synthetic local fixture dictionary." \
      --list-not-primary \
      --include-all-in-list \
      --refresh-search-documents

  PYTHONPATH="$repo_root/packages/ingestion/src${PYTHONPATH:+:$PYTHONPATH}" \
    "$python_bin" packages/ingestion/scripts/import_word_forms.py \
      --database-url "$database_url" \
      --data-dir "$data_dir" \
      --language "$language_code" \
      --dictionary-slug "$dictionary_slug" \
      --refresh-search-documents
}

import_dictionary \
  packages/ingestion/nl/nl-wiktionary-test/data/words_content \
  nl "Nederlands" nl-wiktionary-test "Wiktionary-like NL Test (synthetic)" \
  nl-wiktionary-test-all "Wiktionary-like NL Test" nl-complete-fixture-v1

import_dictionary \
  packages/ingestion/en/en-cambridge-test/data/words_content \
  en "English" en-cambridge-test "Cambridge-like EN Test (synthetic)" \
  en-cambridge-test-all "Cambridge-like EN Test" en-complete-fixture-v1

import_dictionary \
  packages/ingestion/fr/fr-larousse-test/data/words_content \
  fr "Français" fr-larousse-test "Larousse-like FR Test (synthetic)" \
  fr-larousse-test-all "Larousse-like FR Test" fr-complete-fixture-v1

import_dictionary \
  packages/ingestion/de/de-duden-test/data/words_content \
  de "Deutsch" de-duden-test "Duden-like DE Test (synthetic)" \
  de-duden-test-all "Duden-like DE Test" de-complete-fixture-v1

echo "Complete local dictionary fixtures imported successfully."
