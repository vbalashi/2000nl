# Current Transformation Targets

Last updated: 2026-05-19

This document is the shared scratchpad for transformation wishes, questions,
constraints, and target areas after codebase discovery.

## Notes To Add Later

<!-- Add user-stated wishes, questions, decisions, and transformation targets here after codebase discovery. -->

## User-Stated Transformation Direction

The user sees 2000nl becoming a dictionary-backed learning platform rather than
only a single Dutch training app.

Desired concepts:

- Dictionaries exist as first-class sources of entries. Today there is one main
  Dutch dictionary path; future dictionaries may be different sources for the
  same language or dictionaries for different languages.
- A language may have one default dictionary at first, but the system should be
  technically able to add more dictionaries later.
- User dictionaries should let users add their own word-definition-translation-
  example-example-translation entries.
- At startup, each user should be offered at least one shared trusted dictionary.
  This dictionary is not editable by ordinary users and acts as a source of
  verified definitions/translations.
- Dictionary visibility/access may depend on user group and subscription tier.
  For example, a test user, admin, or premium user may see dictionaries that are
  hidden from a free/default user.
- Word lists exist separately from dictionaries. Lists may be curated/system
  lists or user-created lists.
- Lists should be able to combine entries from multiple dictionaries, including
  curated dictionaries and user dictionaries.
- Lists should not be constrained to a single language. UI should provide
  convenient language filters, but the data model should allow mixed-language
  lists if the user wants them.
- The dictionary backend should support more than the 2000nl training UI. A
  browser extension or other app should be able to look up selected words,
  return dictionary/translation/progress context, and optionally update user
  learning state when a user clicks an unknown word.
- The browser extension is one expected backend consumer, but not the only one.
  Future projects such as `/Users/khrustal/dev/audiofilms` may also query the
  backend for dictionary matches and user learning status.
- User learning/progress state should be tracked per learnable card type, with
  FSRS state, click/view counts, timestamps, and related telemetry.
- Card types include word-to-definition, definition-to-word, audio
  understanding, and future variants. Apps should decide their own rendering
  for returned card/data payloads rather than centralizing all UI rendering in
  the backend.
- Duplicate headwords across dictionaries are acceptable. Because users learn
  entries through lists, users may choose which dictionary's entry to add/use.
- User edits to dictionary content should be modeled as entries in a user-owned
  dictionary, not as mutation of the shared trusted dictionary. Copying a shared
  entry into a user dictionary is a likely UX path for custom definitions or
  translations.

## Current Repo Reality

- Current content is stored primarily in `word_entries` with `raw` JSONB and
  language/headword fields. Entries are meaning-level rows and now have
  `meaning_id` plus `dictionary_id`.
- `dictionary_schemas`, `dictionaries`, and `dictionary_entitlements` exist.
  The seeded trusted Dutch dictionary is `nl-vandale` using `nl-vandale-v1`.
- User-owned dictionaries exist at the DB/RPC/action boundary using the
  minimal `user-entry-v1` schema. UI editing is intentionally not built yet.
- Current curated lists are `word_lists` / `word_list_items`; user lists are
  `user_word_lists` / `user_word_list_items`. `primary_language_code` is the
  forward-compatible list language hint; legacy `language_code` remains for
  compatibility.
- Lists now carry optional training intent metadata:
  `default_scenario_id`, `card_policy`, and `card_type_ids`. Lists still store
  entries, not cards. The metadata says how training should treat those entries
  when the list is selected.
- Current card-facing user progress is keyed by `user_id + entry_id +
  card_type_id` in `user_card_status`, with review history in
  `user_review_log`. Legacy scheduler/FSRS functions still use
  `user_word_status`; triggers keep both storage shapes synchronized.
- Current scenarios group modes through `training_scenarios.card_modes`.
- `apps/api` is currently a reserved boundary, not the active backend.
- Active serving logic is split between Supabase/Postgres RPCs and `apps/ui`
  services/API routes.
- Lookup, platform actions, training list reads, card state, recent history,
  active list, and learning preferences now go through RPC/action boundaries
  rather than frontend-owned table mutations.
- Ordinary dictionary lookup is read-only. Mutations that affect FSRS, user
  lists, or user dictionaries are explicit platform actions/RPCs.
- App-local UI settings still live in `user_settings` through the existing
  first-party UI service. Translation cache generation remains an app route,
  but source entry reads are gated through the dictionary access RPC.

## Completed Migration Steps

- Stage 0: fixed `meaning_id` drift and fresh-DB multi-meaning support.
- Stage 1A: added dictionary schema registry, dictionary ownership boundary,
  dictionary access helper, and seeded `nl-vandale`.
- Updated ingestion to import into a dictionary by slug/id and preserve
  dictionary-scoped entry identity.
- Added `user-entry-v1` and DB/RPC/action support for private editable user
  dictionary storage without adding UI editing yet.
- Improved lookup/API shape so candidates include dictionary metadata and
  card-state context without direct client reads of dictionary tables.
- Moved training-adjacent user list, active list, learning preference, history,
  and card-state operations behind RPCs.
- Added list training intent metadata to curated/user list summaries, platform
  actions, and the current training app. `default_scenario_id` is applied when
  a list is selected. `card_policy='restrict'` limits scheduler card modes to
  currently supported UI renderers. `listen-recognize` is supported by the
  current UI; unsupported audio typing modes are filtered out instead of being
  mis-rendered as text cards.
- User-list training intent can be edited from the current settings list UI for
  user-owned lists.

## Remaining Near-Term Targets

- Add UI for user dictionary creation/editing only after deciding the first
  product surface and validation rules.
- Continue reducing direct table access where it crosses platform boundaries;
  keep truly app-local settings explicit.
- Add/refresh docs for platform endpoint payloads as external consumers become
  real clients.
- Broaden DB/API regression tests around dictionary visibility, private user
  dictionaries, and translation/lookup read-only guarantees.

## Planning Questions

- Should user-created dictionary entries be private by default, shareable later,
  or immediately reusable by other users through published dictionaries?
- For external clients, ordinary lookup should be read-only. Specific actions
  can write events or mutate lists/status.
- Current dictionary entries are already meaning-level rows: one unique entry
  per definition. Therefore `entry_id + card_type_id` is sufficient for the
  current card identity model.
- Durable generated card IDs are not needed now, but may be useful later for
  cards based on a specific example sentence, audio prompt, or other sub-entry
  artifact.

## Proposed Review Package

- `docs/exec-plans/active/platform-dictionary-transformation.md`
- `docs/exec-plans/active/dictionary-schema-and-lookup-review.md`
- `docs/exec-plans/active/senior-review-request-platform-dictionary.md`
- `docs/exec-plans/active/platform-dictionary-review-bundle-manifest.md`
- `packages/shared/types/platform.ts`
- `packages/shared/types/index.ts`

## Short Prompt For The Next Agent

You are helping the user explore the 2000nl project before deciding what to transform. Start by reading `AGENTS.md`, `ARCHITECTURE.md`, `docs/intent/index.md`, and `docs/intent/current-transformation-targets.md`. Treat `docs/intent/current-transformation-targets.md` as an initially empty scratchpad: do not invent or pre-fill transformation areas. Give the user a guided tour of the current codebase, answer questions from repo reality, ask clarifying questions, and only record wishes or target areas after the user states them.
