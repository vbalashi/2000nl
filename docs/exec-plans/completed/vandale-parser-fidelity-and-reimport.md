# Van Dale Parser Fidelity And Re-import

Status: completed
Work reference: `vandale-parser-fidelity-and-reimport`
Owner: Codex worktree `codex/vandale-parser-fidelity`
Started: 2026-07-29

## Objective

Preserve the semantic structure present in the Van Dale source HTML, generate
collision-safe artifacts, reconcile them with durable Platform entry identity,
rehearse the import against a production-like database, and only then perform
an approved Supabase cutover with UUID and user-state invariants intact.

## Claimed scope

- `packages/scraper/`
- `packages/ingestion/`
- `packages/shared/schemas/nl/`
- dictionary-identity migrations and DB import probes under `db/`
- dictionary ingestion/runbook/reference documentation under `docs/`

Unrelated UI, translation, FSRS, and provenance work is out of scope.

## Test seams proposed for confirmation

1. `parse_vandale_entry_fixed(content_html, headword_html)`:
   source HTML in, one structured provider article out.
2. The raw-word processing command:
   `word_list.json` in, deterministic collision-safe artifact manifest out.
3. The source-managed importer:
   an approved manifest plus a disposable Postgres database in, stable bindings,
   preserved UUIDs, and explicit ambiguity/rejection results out.

## Safety gates

- Never key source identity only by headword, POS, or sense ordinal.
- Never silently overwrite an artifact or database row.
- Preserve existing `word_entries.id` values and all user-state references.
- Fail closed for ambiguous legacy matches.
- Rehearse additive schema/backfill/import on a disposable production-like
  snapshot before any production mutation.
- Do not perform production cutover while ADR 0003 gates remain unresolved.

## Progress

- 2026-07-29: read workspace/project rules, architecture principles, and ADR
  0003; inspected parallel work; created isolated worktree and claimed scope.
- 2026-07-29: added parser fixtures for definitions, synonyms, antonyms,
  morphology, usage/grammar labels, notes, cross-references, idioms, reference
  tables, and source identity; implemented the parser changes test-first.
- 2026-07-29: generated 18,163 collision-safe artifacts from 14,449 source
  records with a deterministic manifest. A clean second generation produced
  the same manifest checksum.
- 2026-07-29: reconciled all 17,408 production source UUIDs. 17,388 matched
  exact legacy payload fingerprints and 20 uniquely matched reviewed
  metadata-only legacy variants; 755 restored artifacts were approved as new.
- 2026-07-29: implemented the versioned source-binding ledger, disjoint
  source/user writer spaces, manifest-led importer, exact-coverage word-form
  rebuild, and true identical-manifest no-op.
- 2026-07-29: restored the full production backup to a disposable local
  database, applied migration 104 twice, imported the corpus, rebuilt forms
  and search, and verified UUID and consumer invariants.
- 2026-07-29: preserved the old local generated corpus, installed v2 under
  `db/data/words_content`, and created a fresh validated production backup.
- 2026-07-29: completed the production cutover: 18,163 active source entries,
  68,102 forms, 18,163 Van Dale search documents, and a completed 18,180-row
  search backfill. Existing user-state checksums remained identical and strict
  lookup returned all 12 `goed` candidates.
- 2026-07-29: published the UI and operations handoff at
  `docs/runbooks/vandale-v2-ui-and-operations-handoff.md`.
