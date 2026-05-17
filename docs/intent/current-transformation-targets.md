# Current Transformation Targets

Last updated: 2026-05-17

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
  language/headword fields.
- Current curated lists are `word_lists` / `word_list_items`; user lists are
  `user_word_lists` / `user_word_list_items`.
- Current user progress is keyed by `user_id + word_id + mode` in
  `user_word_status`, with review history in `user_review_log`.
- Current scenarios group modes through `training_scenarios.card_modes`.
- `apps/api` is currently a reserved boundary, not the active backend.
- Active serving logic is split between Supabase/Postgres RPCs and `apps/ui`
  services/API routes.

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
