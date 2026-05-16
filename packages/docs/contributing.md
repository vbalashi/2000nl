# Contributing

## Add a new dictionary
1. Implement or update a scraper/parser in `packages/scraper` for the source format.
2. Store source data under an explicit source-data directory, following the current Van Dale pattern when possible: `packages/ingestion/<lang>/<source>/data/`.
3. Update or add ingestion scripts so entries load into `word_entries.raw` and related lookup/list tables.
4. Keep shared schemas/types aligned when the structured entry shape changes.
5. Run ingestion scripts to load into the DB.

## Add a new language
1. Create `packages/shared/schemas/<lang>/note.schema.json` describing the template.
2. Add language entry to `languages` table and shared constants.
3. Update UI registry if field names differ for rendering.

## Add a card type
1. Append a new entry to `packages/shared/card-types/card-types.json` with prompt/reveal fields and `input_mode`.
2. Implement UI rendering if a new `input_mode` is needed; reuse existing components when possible.
3. Ensure the current training/session path can emit this card type. Today that usually means checking DB-side selection logic and the UI flow, not a standalone `apps/api` service.

## Add a list
1. Insert curated lists into `word_lists`, or use the active app/runtime path for user lists.
2. Populate `word_list_items` or `user_word_list_items` referencing `word_id`.

## Development
- UI lives in `apps/ui` (Next.js). Install and run from that directory.
- Ingestion scripts in `packages/ingestion/scripts` use `requirements.txt`.
- Keep shared schemas/types aligned with the active `word_entries.raw` shape and UI expectations.
