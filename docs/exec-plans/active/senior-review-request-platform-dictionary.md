# Senior Review Request: Platform Dictionary Transformation

## Reviewer Prompt

You are the senior reviewer for a proposed transformation of the 2000nl
monorepo from a single Dutch card-training app into a dictionary-backed learning
platform used by multiple clients.

Start by reading:

- `AGENTS.md`
- `ARCHITECTURE.md`
- `docs/intent/current-transformation-targets.md`
- `docs/exec-plans/active/platform-dictionary-transformation.md`
- `docs/exec-plans/active/dictionary-schema-and-lookup-review.md`
- `docs/exec-plans/active/dictionary-search-review-brief.md`
- `docs/intent/search-and-lists/search-ranking-grouping-contract.md`
- `docs/reference/api-functions/search-and-user.md`
- `packages/shared/types/platform.ts`
- `packages/shared/schemas/nl/note.schema.json`

Then inspect the current implementation paths that matter:

- `db/migrations/001_core_schema.sql`
- `db/migrations/003_queue_training.sql`
- `db/migrations/004_user_features.sql`
- `packages/ingestion/src/importer`
- `packages/ingestion/scripts`
- `apps/ui/lib/training`
- `apps/ui/lib/platform/platformApi.ts`
- `apps/ui/components/training/wordlist/DictionarySearchTab.tsx`
- `apps/ui/components/training/wordlist/WordListTab.tsx`
- `apps/ui/components/training/TrainingScreen.tsx`
- `apps/ui/components/training/TrainingCard.tsx`
- `apps/ui/app/api/translation/route.ts`
- `apps/ui/app/api/tts/route.ts`

Review the included sample dictionary JSON files from `db/data/words_content`.

## Context To Validate

The user wants:

- shared trusted dictionaries that are visible according to user group and
  subscription tier,
- user-owned editable dictionaries,
- lists that can mix entries from multiple dictionaries and languages,
- external lookup clients such as Pontix and AudioFilms,
- ordinary external lookup to be read-only,
- explicit actions to mutate FSRS/list/user dictionary state,
- current card identity to remain `entry_id + card_type_id` because entries are
  already meaning-level rows.

## Questions For Review

1. Is schema registry (`dictionary_schemas`) the right abstraction, or should
   schema live only in repo files and dictionary metadata?
2. Should the current Dutch schema become `nl-vandale-v1`, `common-euro-v1`, or
   both through inheritance/composition?
3. What is the safest first DB migration sequence?
4. Is the confirmed `meaning_id` contract sufficient for meaning-level entry
   identity during dictionary/search expansion?
5. Should dictionary visibility use simple columns on `dictionaries`, a separate
   entitlement table, or RLS-only policy logic?
6. Should `word_lists.language_code` become nullable/derived for mixed-language
   lists, or should a new list metadata model be introduced?
7. Which backend responsibilities belong in Postgres RPCs, which in a shared
   backend/API layer, and which should remain app-specific?
8. Should external clients call separate `lookup`, `actions`, and optional
   `translate` endpoints, or a composite `analyze-selection` endpoint?
9. What hidden coupling in `TrainingScreen`, `TrainingCard`, selection RPCs, or
   ingestion would make this transformation risky?
10. What tests are missing before starting migration work?
11. Does the current dictionary search implementation search the right fields
    and rank results in a way that matches dictionary-user expectations?
12. Should search remain an enriched Postgres RPC, move to extracted Postgres
    search documents, or eventually use an external search layer?

## Expected Output

Please produce:

- a critique of the proposed model,
- a recommended first migration,
- a boundary map:
  - shared backend,
  - app-specific backend,
  - frontend-only responsibilities,
- a risk list ordered by severity,
- acceptance criteria and validation commands for the first implementation
  stage.
