# Contributing

## Add a new dictionary
1. Implement a scraper adapter in `packages/scraper` that outputs artifacts to `data/raw/<dictionary>/<lang>/<date>/`.
2. Ensure artifacts validate against `packages/shared/schemas/<lang>/note.schema.json`.
3. Add dictionary metadata entry (code, name, version) to shared constants/types.
4. Run ingestion scripts to load into the DB.

## Add a new language
1. Create `packages/shared/schemas/<lang>/note.schema.json` describing the template.
2. Add language entry to `languages` table and shared constants.
3. Update UI registry if field names differ for rendering.

## Add a card type
1. Append a new entry to `packages/shared/card-types/card-types.json` with prompt/reveal fields and `input_mode`.
2. Implement UI rendering if a new `input_mode` is needed; reuse existing components when possible.
3. Ensure API training session builder can emit this card type.

## Add a list
1. Insert into `lists` with `kind = system` or via API for user lists.
2. Populate `list_entries` referencing `headword_id` (and `meaning_id` when applicable).

## Development
- UI lives in `apps/ui` (Next.js). Install and run from that directory.
- Ingestion scripts in `packages/ingestion/scripts` use `requirements.txt`.
- Keep schemas and types in `packages/shared` as the single source of truth.
