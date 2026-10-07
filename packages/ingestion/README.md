# packages/ingestion

Validates scraped artifacts, normalizes them, and loads them into the database.

Responsibilities:
- Validate raw artifacts against shared JSON Schemas (`packages/shared/schemas`).
- Normalize to the current relational model: `languages`, `dictionaries`, `word_entries`, `word_forms`, `word_lists`, and `word_list_items`.
- Apply migrations located in `db/migrations`.
- Log rejects with reasons for cleanup.

Scripts (see `packages/ingestion/SCRIPTS.md` for timestamps and details):
- `process_raw_words.py` – parse Vandale HTML (`data/word_list.json`) into structured `data/words_content/` when run from a source-data directory such as `packages/ingestion/nl/vandale-nt2/`.
- `import_words_db.py` – load structured entries into a dictionary in Postgres and seed the NT2 list.
- `import_word_forms.py` – populate `word_forms` lookup from structured entries.
- `generate_complete_fixture_dictionaries.py` – generate four small,
  source-managed multilingual QA dictionaries with full VanDale-shaped JSON
  payloads and versioned manifests.
- `audit_pointer_meanings.py` – audit a bounded, deterministic corpus sample for
  resolvable pointer-only meanings without treating arbitrary hyphens as
  redirects.
- `audit_vandale_classification.py` – reparse a complete versioned Van Dale
  manifest in memory and report source-shape, artifact, fingerprint, and
  Platform V2 node diffs without writing artifacts or database state.
- `reconcile_vandale_drop.py` – apply the separately approved, fail-closed
  single-entry #341 repair only after the exact source audit, released
  production baseline, entry, node set, and pre-operation snapshot checks pass;
  the same snapshot can be supplied to `--rollback-snapshot` for a guarded
  single-entry restore.

`process_raw_words.py` produces a checksummed `vandale-structured-v2`
manifest. The supported Van Dale import path requires that manifest and uses
versioned source-entry bindings, so homographs can coexist without changing
existing Platform UUIDs. `import_words_db.py` defaults to the seeded
`nl-vandale` dictionary and `nl-vandale-v2` schema. Manifest-free
natural-key writes are rejected, including for test fixtures; committed tests
generate a small versioned manifest instead.

The importer is a content deployment, not a normal application-start step.
Run it for a new/empty database or after publishing a changed source manifest;
do not run it merely to start the UI, execute normal tests, or reuse an already
populated database. With staging (migration 178), the complete 18,163-artifact
corpus took 20.39 seconds on a clean local DB on 2026-09-30. Identical replay took
8.78 seconds; changing one definition took 16.73 seconds and reconciled only one
word. These are observations, not guaranteed times for arbitrary host load or
mass content changes. The 155.74-second figure is a historical measurement of an
intermediate implementation from 2026-09-29, not the current expected runtime.

The importer does more than insert 18,000 word rows. It validates the manifest,
preserves stable word and Content Node UUIDs, reconciles definitions/examples,
updates source bindings and the NT2 list, and rebuilds the derived
"unrenderable ordinary meaning" projection in bounded batches. Word forms and
search documents remain separate explicit jobs. See
[`docs/runbooks/dictionary-import.md`](../../docs/runbooks/dictionary-import.md)
for the operation-by-operation explanation and the decision guide, or the
[Russian explanation](../../docs/runbooks/dictionary-import.ru.md).

Source generation promotes a meaning to the explicit `cross_reference`
contract only when its entire local content is one exact token ending in `-`
and that token is also a source headword. Meanings with examples, notes,
relations, grammar, or other local content remain learnable meanings even when
their definition contains a hyphen.

Run `import_word_forms.py` after the entry import. For a versioned corpus it
resolves each entry through the source-binding ledger and fails closed if the
manifest and active bindings do not have exact coverage.

## Adding or converting a dictionary

Follow [dictionary and language onboarding](../docs/contributing.md), including
[morphology normalization and display order](../docs/contributing.md#morphology-normalization-and-display-order),
before importing a new source. Normalize provider labels in the source adapter
and ingestion layer; keep grammatical display order independent of JSON/JSONB
key order, preserve alternate forms, and verify the public projection and
rendered output against source examples.

## Complete local multilingual fixtures

The synthetic complete fixtures live under:

- `packages/ingestion/nl/nl-wiktionary-test/`
- `packages/ingestion/en/en-cambridge-test/`
- `packages/ingestion/fr/fr-larousse-test/`
- `packages/ingestion/de/de-duden-test/`

The names are deliberately marked as synthetic: these are not exports from the
named reference dictionaries. Each dictionary contains ten entries with
definitions, contexts, examples, idioms, morphology, and source identity. The
repeatable local import command is:

```bash
scripts/import-complete-local-dictionaries.sh
```

It targets local Supabase by default, keeps the fixture lists out of the
primary training-list selection, and refreshes `word_forms` and search
documents. The command is safe to run repeatedly.
