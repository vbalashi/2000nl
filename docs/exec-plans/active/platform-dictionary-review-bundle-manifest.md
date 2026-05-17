# Platform Dictionary Review Bundle Manifest

## Archive Purpose

This bundle is prepared for a senior-agent second opinion on the platform
dictionary transformation.

## Core Planning Files

- `AGENTS.md`
- `ARCHITECTURE.md`
- `docs/intent/index.md`
- `docs/intent/current-transformation-targets.md`
- `docs/exec-plans/active/platform-dictionary-transformation.md`
- `docs/exec-plans/active/dictionary-schema-and-lookup-review.md`
- `docs/exec-plans/active/senior-review-request-platform-dictionary.md`

## Existing Schema And Data Contracts

- `packages/shared/schemas/nl/note.schema.json`
- `packages/shared/types/index.ts`
- `packages/shared/types/platform.ts`
- `packages/shared/card-types/card-types.json`
- `packages/docs/data-model.md`
- `packages/docs/card-types.md`

## Database And Ingestion Files

- `db/README.md`
- `db/migrations/001_core_schema.sql`
- `db/migrations/003_queue_training.sql`
- `db/migrations/004_user_features.sql`
- `db/migrations/archive/0007_add_meaning_id.sql`
- `packages/ingestion/README.md`
- `packages/ingestion/SCRIPTS.md`
- `packages/ingestion/src/importer/core.py`
- `packages/ingestion/src/importer/db.py`
- `packages/ingestion/src/importer/dictionary_entry_parser.py`
- `packages/ingestion/src/importer/word_forms.py`
- `packages/ingestion/scripts/process_raw_words.py`
- `packages/ingestion/scripts/import_words_db.py`
- `packages/ingestion/scripts/import_word_forms.py`

## UI And Runtime Files

- `apps/api/README.md`
- `apps/ui/lib/types.ts`
- `apps/ui/lib/training/wordMappers.ts`
- `apps/ui/lib/training/selectionService.ts`
- `apps/ui/lib/training/reviewService.ts`
- `apps/ui/lib/training/listService.ts`
- `apps/ui/lib/wordUtils.ts`
- `apps/ui/components/training/TrainingScreen.tsx`
- `apps/ui/components/training/TrainingCard.tsx`
- `apps/ui/app/api/translation/route.ts`
- `apps/ui/app/api/tts/route.ts`

## Dictionary JSON Samples

- `db/data/words_content/aflopen_ww_1.json`
- `db/data/words_content/aflopen_ww_2.json`
- `db/data/words_content/aflopen_ww_3.json`
- `db/data/words_content/fiets_zn_1.json`
- `db/data/words_content/bank_zn_1.json`
- `db/data/words_content/bank_zn_2.json`
- `db/data/words_content/de_lidw_1.json`
- `db/data/words_content/aan_vz_1.json`
- `db/data/words_content/ouwe_bn_1.json`

## External Consumer Notes

The bundle includes notes from quick inspection of:

- `/Users/khrustal/dev/translate-extension`
- `/Users/khrustal/dev/audiofilms`

It does not include those external repositories' source files.
