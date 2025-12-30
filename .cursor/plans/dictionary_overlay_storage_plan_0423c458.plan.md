---
name: Dictionary overlay storage plan
overview: Design data model and flow to store reusable translations and per-user notes for dictionary cards stored in DB.
todos:
  - id: db-schema
    content: Design tables translations and user_notes with indexes
    status: pending
  - id: api-flow
    content: Define fetch/translate job flow and cache invalidation
    status: pending
  - id: ui-contract
    content: Specify overlay payload shape for UI toggle
    status: pending
---

# Overlay Storage Plan

## Data model (DB)

- Use existing immutable card table as source; reference by stable card_id (e.g., filename key like uitmaken_ww_1).
- Create table translations(card_id, lang, field_type, field_key, source_text, translated_text, source_hash, created_at, updated_at, UNIQUE(card_id, lang, field_type, field_key)) to cache DeepL results per meaningful field (definition/context/examples/idioms) in one-to-one rows. Store source_hash to detect source text drift; if hash mismatches, mark stale.
- Create table user_notes(card_id, user_id, note, created_at, updated_at) for freeform per-user comments; card remains immutable. Optional: add note_type enum later if structure needed.
- Optionally create view aggregated_translations per card/language to ease fetch.

## API/workflow

- Fetch flow: for card + user_lang, read translations rows; if missing or stale, enqueue translate job.
- Translate job: collect meaningful fields from card, call DeepL once per field (or batch), upsert into translations with source_hash. Respect rate limits and retry policy.
- UI payload: include base card plus overlays: translations grouped by field_type/field_key; include user_notes for current user; allow toggle to show/hide.

## Field mapping

- field_type values: definition, context, example, idiom_expression, idiom_explanation. field_key indexes within arrays (e.g., example[0]).
- source_hash = hash of source_text (and maybe card version) to invalidate if source changes.

## Permissions

- translations shared globally (no user_id). user_notes scoped by user_id. Allow soft-delete or edit by owner only.

## Migration/backfill

- Add tables and indexes; optional background job to pre-translate top cards to ru.

## Testing

- Unit: translation lookup + cache miss triggers enqueue; hash mismatch refresh; notes CRUD permissions.
- Integration: end-to-end fetch card -> missing translations -> job -> cached response.