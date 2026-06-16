# Dictionary Schema And External Lookup Review

## Purpose

This document narrows the platform transformation to two decisions:

- how dictionary entry schemas should be represented and validated,
- how external clients should combine sentence translation with dictionary/user
  learning lookups.

It is part of the senior-review package and should be read with
`platform-dictionary-transformation.md`.

## Current Dictionary Artifacts

Source examples live under `db/data/words_content/`.

Observed shape:

- Each JSON file is an array containing one entry object.
- Current entries are meaning-level rows. For example `aflopen_ww_1.json`,
  `aflopen_ww_2.json`, and `aflopen_ww_3.json` share the same headword but have
  different definitions and `meaning_id` values.
- Top-level fields are stable across the sampled corpus: `headword`,
  pronunciation fields, `gender`, `part_of_speech`, noun/verb/adjective forms,
  `cross_reference`, `is_nt2_2000`, `meanings`, `audio_links`, `images`,
  `_metadata`, `_raw_html`, and `meaning_id`.
- The importer strips `_raw_html` before storing `raw` in Postgres.
- `packages/shared/schemas/nl/note.schema.json` already describes the current
  Dutch note shape.

Local corpus scan on `db/data/words_content`:

- 17,959 JSON entries.
- All sampled/generated entries contain `_raw_html` before import.
- Main POS counts: `zn` 9,353; `ww` 4,086; `bn` 2,264; `bw` 789; missing/null
  712; plus smaller POS groups.
- Meaning fields are `definition`, `context`, `examples`, and `idioms`.
- Examples: 14,504 total; idioms: 2,338 total.

Production/schema check:

- Production `word_entries` has `meaning_id integer not null`.
- Production has unique index
  `word_entries_language_headword_meaning_idx(language_code, headword,
  meaning_id)`.
- Current consolidated migration `001_core_schema.sql` also includes
  `meaning_id`, so the earlier review concern about consolidated schema drift
  is resolved. `meaning_id` is not a blocker for new dictionary/search
  migrations.

## Candidate Schema Model

Use a schema registry rather than one hardcoded global dictionary schema.

Recommended pieces:

- `dictionary_schemas`
  - `id`: stable key such as `nl-vandale-v1`, `common-euro-v1`,
    `user-entry-v1`.
  - `language_code`: nullable if schema is cross-language.
  - `version`.
  - `json_schema`: JSON Schema document used for validation.
  - `render_capabilities`: metadata such as definitions, translations,
    examples, audio, images, conjugation, morphology.

- `dictionaries`
  - `entry_schema_id`.
  - `entry_schema_version`.
  - source/access/entitlement metadata from the platform plan.

- `word_entries`
  - keep `raw jsonb` as the fidelity layer.
  - add `dictionary_id`, `entry_schema_id`, `entry_schema_version`.
  - keep extracted/searchable columns such as `language_code`, `headword`,
    `part_of_speech`, `gender`, `meaning_id`.
  - eventually replace source-specific columns like `vandale_id` with
    `source_entry_id` and `source_meta`.

## Base Entry Envelope

The backend and clients should depend on a common envelope, not every
source-specific raw field.

Candidate envelope:

- `headword`: required.
- `language_code`: required at DB level.
- `part_of_speech`: optional.
- `gender`: optional.
- `meaning_id`: required for imported meaning-level entries; may default to 1
  for user-created entries.
- `meanings`: array, usually one meaning per entry in the current model.
- `audio_links`, `images`, morphology/conjugation fields: optional.
- `translations`: optional user/source-provided translations, distinct from
  provider-generated cache overlays.
- `source_meta`: optional source details.

For user dictionaries:

- Use the same envelope.
- Required minimum should be `headword` plus at least one useful content field:
  definition, translation, example, or note.
- Users should not have to fill every field.
- Rendering must show only populated fields.
- Copying from a trusted dictionary into a user dictionary should create a new
  user-owned entry with the same schema-compatible shape.

## Why Not One Fixed Schema Only?

The current VanDale shape likely works for many European-language dictionaries,
but the platform should not assume all future dictionaries expose the same
morphology, audio, idioms, examples, or translation fields.

The schema registry gives these benefits:

- ingestion can validate source-specific details;
- search/indexing can rely on normalized extracted columns;
- card generation can check capabilities before creating a card type;
- UI renderers can safely omit missing optional fields;
- user dictionaries can stay simple without inventing a separate incompatible
  data model.

## Card Identity

Current decision:

- Use `entry_id + card_type_id`.

Reason:

- Existing dictionary entries are already meaning-level rows, so the entry
  identifies the definition being trained.
- `entry_id + word-to-definition` and `entry_id + definition-to-word` are
  separate card states.

Future escape hatch:

- Introduce durable `cards` only if a single entry needs multiple cards of the
  same type for sub-entry artifacts.

Examples where durable cards could become useful:

- one audio-understanding card per example sentence;
- one card per image;
- one cloze card per phrase inside an example;
- one conjugation card per tense/person if those are not represented as
  separate card types.

## External Lookup And Translation Flow

Expected consumers:

- 2000nl web training app,
- Pontix Chrome extension at `/Users/khrustal/dev/translate-extension`,
- future audio/video learning app such as `/Users/khrustal/dev/audiofilms`,
- other clients that need dictionary lookup plus user learning state.

Recommended API shape:

1. `lookup`
   - read-only by default.
   - input: selected word/phrase, context sentence, source language hint,
     optional target translation language, app/client ID.
   - for a single word: normalize, search dictionary entries and word forms,
     return candidate entries, list memberships, and user card states.
   - for a sentence/phrase: tokenize/normalize words, return matches for words
     that exist in dictionaries.

2. `actions`
   - explicit mutations only.
   - add entry to list.
   - mark entry/card as unknown.
   - start learning a card type.
   - copy trusted entry into a user dictionary.
   - record review/lapse when the user chooses a specific entry/card.

3. `translate` or `analyze`
   - optional shared backend endpoint for provider-backed sentence translation.
   - should be separate from core lookup, or an explicit option on a composite
     endpoint.

Recommendation:

- Keep dictionary lookup/status and provider translation separable.
- Offer an optional backend aggregator for apps that want one round trip or need
  server-held provider keys.
- Do not force every client to use backend translation if it already owns its
  provider configuration.

Rationale:

- Lookup is first-party domain logic and should be stable.
- Translation provider calls are cost/privacy/provider-policy sensitive.
- The Chrome extension currently already performs provider calls itself.
- AudioFilms currently has provider abstractions and could adopt the lookup
  endpoint without surrendering its own translation/provider architecture.

## Senior Review Questions

- Should `dictionary_schemas` be a DB table, a shared repo registry, or both?
- Should current `packages/shared/schemas/nl/note.schema.json` be renamed or
  wrapped as `nl-vandale-v1`?
- What is the minimum valid user dictionary entry?
- Should translations inside user dictionary entries use a structured map like
  `translations[target_lang]`, or should translations remain meaning-level
  fields?
- Should the backend expose separate `lookup` and `translate` endpoints, or a
  composite `analyze-selection` endpoint with optional translation?
