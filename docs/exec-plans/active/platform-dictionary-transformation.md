# Platform Dictionary Transformation

## Goal

Transform 2000nl from a single-app Dutch vocabulary trainer into a
dictionary-backed learning platform that can serve:

- the current 2000nl training app,
- future language/dictionary sources,
- user-created dictionaries,
- curated and user word lists that can mix sources,
- external clients such as a browser extension.

This began as a planning/review package and now also tracks the staged
implementation status.

Related review detail: `dictionary-schema-and-lookup-review.md`.

## User-Stated Product Model

The user wants the platform to have these separable concepts:

- Dictionaries: source containers for entries. A dictionary can be curated and
  immutable, or user-owned and editable.
- At least one curated trusted dictionary is available to every user by default.
  It is shared, non-user-editable, and treated as a verified source.
- Dictionary access is not simply public/private. Visibility can depend on user
  group and subscription tier: for example default, test, admin, free, premium,
  or future entitlement groups.
- Dictionary entries: word-definition-translation-example-example-translation
  content, plus source-specific data when available.
- Word lists: curated or user-created collections that may combine entries from
  multiple dictionaries.
- Word lists should not be language-constrained at the schema level. Language is
  filterable metadata, not a hard data constraint.
- Card types: learnable projections such as word-to-definition,
  definition-to-word, audio understanding, and future variants.
- User card state: FSRS state, click/view counts, timestamps, hide/freeze flags,
  and event telemetry per user and per learnable card type.
- Applications: the current 2000nl web app, browser extension, and future
  clients should render their own UI over shared backend payloads.
- External backend consumers are not limited to the Chrome extension. Future
  projects such as `/Users/khrustal/dev/audiofilms` may query the same backend
  for dictionary lookup and user learning status.
- Duplicate headwords across dictionaries are allowed. Users choose the entry
  they want to learn by adding that entry to lists.
- User corrections/custom translations should become entries in a user-owned
  dictionary, likely through a "copy from trusted dictionary" UX, rather than
  mutating shared dictionary content.

## Current State

Database:

- `languages` exists as a language catalog.
- `word_entries` stores dictionary content with `language_code`, `headword`,
  VanDale-specific fields, and `raw` JSONB.
- `word_entries` includes `meaning_id` and `dictionary_id`; current import code
  treats each `(dictionary_id, headword, meaning_id)` as a distinct
  meaning-level entry.
- `dictionary_schemas`, `dictionaries`, and `dictionary_entitlements` exist.
  The seeded trusted Dutch dictionary is `nl-vandale` using `nl-vandale-v1`.
- `word_lists` / `word_list_items` represent curated lists.
- `user_word_lists` / `user_word_list_items` represent user lists.
- User lists reference `word_entries` directly and can mix entries in practice.
  `primary_language_code` is the forward-compatible list language hint while
  legacy `language_code` remains for compatibility.
- `user_card_status` is the active storage table keyed by `entry_id +
  card_type_id`. Legacy `user_word_status` exists in the schema but is no
  longer synchronized or used by active RPCs.
- `training_scenarios` groups card mode IDs in `card_modes`, including the
  supported audio recognition mode.

Backend/runtime:

- `apps/api` is reserved and mostly empty.
- Active backend behavior is Supabase/Postgres RPCs plus server/API routes in
  `apps/ui`.
- `get_next_word` selects `word_entries` from list scope and returns card-ish
  payloads with `mode` and stats; `get_next_card` is the card-named wrapper.
- `handle_review` and `handle_click` mutate FSRS/review state; new platform
  and app code should prefer `handle_card_review`, `record_card_view`,
  `start_learning_entry_card`, and `get_user_card_state`.
- Translation/TTS routes are app-local Next.js routes.

Frontend:

- `TrainingScreen` orchestrates sessions and calls service modules.
- `TrainingCard` renders active Dutch card modes directly.
- Shared card registry exists but is not yet a complete runtime renderer.

## Fit/Gaps Against Target

Already aligned:

- Languages exist.
- Curated and user lists exist.
- Lists already reference entries rather than hardcoding one card type.
- FSRS/user state already has per-mode granularity.
- Card scenarios already group internal card modes.
- The active service layer has been split enough to support backend extraction
  later.

Main gaps:

- Dictionary source is first-class for current trusted and user-owned
  dictionaries, but more runtime paths still need to consume dictionary metadata
  directly.
- Dictionary entry schema is first-class at the DB registry boundary. More
  clients still need to consume schema metadata consistently.
- VanDale-specific fields live directly on `word_entries`.
- User-created dictionary entries do not exist as editable content separate from
  user lists.
- A user list item can only reference an existing `word_entries.id`; there is no
  explicit support for source ownership, publication state, or mixed-language
  list semantics.
- User progress has physical `entry_id + card_type_id` storage, but legacy
  scheduler functions still operate through `word_id + mode`.
- External clients do not have a stable public API boundary. They would need to
  call Supabase/RPCs or app-local routes directly.
- Lookup telemetry and FSRS lapse semantics are coupled through `handle_click`;
  external lookup clients need a clearer command/event contract.

## Recommended Conceptual Model

Use this as the review candidate:

- Dictionary owns entries.
- Entry is the source/content unit.
- Dictionary declares the entry schema/version used by its entries.
- Card type defines a learnable projection over an entry.
- List contains entries, not cards.
- Training session expands list entries into cards according to selected
  scenarios/card types.
- User card state should be keyed by `user_id + entry_id + card_type_id` for
  the current model.
- Events should distinguish passive lookup/view telemetry from explicit training
  review actions and from "lookup means forgotten" actions.

Reasoning:

- Lists stay reusable across W->D, D->W, audio, and future card types.
- Apps can render cards differently while sharing content/state.
- Existing `user_word_status(user_id, word_id, mode)` can migrate gradually
  because `word_id` maps to entry and `mode` maps to card type.
- Allowing duplicate entries avoids premature canonicalization. If VanDale,
  Oxford, Cambridge, and a user dictionary all contain a similar headword, those
  are separate entries with different source trust and content.
- Current entries are already meaning-level records: the same headword can
  appear as multiple rows when definitions differ. Because of that,
  `entry_id + card_type_id` points to a specific definition-level card today.

## Schema Direction

Stage 1 should be additive and backward-compatible.

Candidate new/changed tables:

- `dictionaries`
  - `id`
  - `language_code`
  - `slug`
  - `name`
  - `description`
  - `owner_user_id` nullable
  - `kind` or `visibility`: curated/system/user/private/shared
  - `is_editable`
  - `source_provider`
  - `source_version`
  - entitlement/access metadata such as minimum subscription tier, visible user
    groups, or an access policy key
  - `entry_schema_id`
  - `entry_schema_version`
  - timestamps

- `dictionary_schemas`
  - `id`
  - `language_code` nullable for cross-language schemas
  - `version`
  - `json_schema`
  - `render_capabilities` / feature metadata

- `word_entries`
  - add `dictionary_id`
  - add `entry_schema_id` / `entry_schema_version` or derive them from
    dictionary
  - ensure `meaning_id` is present in consolidated migrations
  - keep current columns during migration
  - eventually replace source-specific columns like `vandale_id` with
    `source_entry_id` and `source_meta`

- `word_forms`
  - keep referencing entry IDs
  - optionally add dictionary-aware search helpers rather than changing the key
    immediately

- `word_lists`
  - keep curated/system lists
  - change single-language assumptions into nullable `primary_language_code` or
    derived language facets
  - keep language filtering in query/UI, not as a list membership constraint
  - keep list items referencing entries

- `user_word_lists`
  - apply the same mixed-language-friendly metadata model as curated lists

- `card_types`
  - optional DB table if card type availability must be controlled by backend
  - otherwise keep registry in `packages/shared/card-types` and mirror stable
    IDs in DB constraints/docs

- `user_card_status`
  - eventual replacement or compatibility view over `user_word_status`
  - columns map from current FSRS fields
  - key by `user_id + entry_id + card_type_id`

Avoid in the first migration:

- Splitting `word_entries.raw` into fully normalized meanings/examples.
- Rewriting all queue logic at once.
- Moving all UI-local API routes into `apps/api`.
- Creating a universal renderer.
- Forcing all dictionaries into the exact VanDale field set.

## Backend Boundary Direction

Keep Postgres as the scheduler source of truth, but introduce a shared backend
API boundary for cross-client operations.

Shared backend responsibilities:

- dictionary search and lookup,
- list CRUD and list item mutation,
- user dictionary CRUD,
- card/session payload construction,
- lookup/view/review event commands,
- user card status summaries,
- auth enforcement and service-role isolation.
- browser-extension lookup status, including list memberships and user learning
  state for selected text.
- generalized lookup/status endpoints for future clients such as audio/video
  learning apps.

App-specific backend responsibilities:

- 2000nl-only training session orchestration until extracted,
- translation/TTS provider routing if those remain product-specific,
- dev/test auth helpers,
- UI-specific debug routes.

Likely path:

1. Define shared domain types in `packages/shared`.
2. Add additive DB schema and compatibility views/RPCs.
3. Wrap current Supabase calls in domain service modules that can be reused by
   `apps/ui` and future `apps/api`.
4. Only then revive `apps/api` or create a versioned API surface for extension
   clients.

## Frontend Direction

Current 2000nl frontend should continue rendering its own card UX.

Shared contract should provide:

- entry content,
- dictionary/source metadata,
- list memberships,
- generated card type/mode,
- user status/stats,
- available actions.

App-specific rendering should stay in:

- `apps/ui/components/training/TrainingCard.tsx`,
- future extension UI code,
- future mobile/tablet-specific views.

Do not centralize responsive layout or visual rendering in the backend. The
backend should return structured data and stable card-type IDs.

## Open Planning Questions

1. User dictionary visibility: private-only first, shareable later, or public
   publishing from the start?
2. Extension write semantics: should a plain lookup be read-only, while
   explicit actions such as "I don't know this", "add to list", or "start
   learning" write events/reviews?
3. Dictionary entitlement model: should access be represented directly as
   columns (`minimum_tier`, `visible_to_groups`) or through a separate policy/
   entitlement table?

Resolved for now:

- Duplicates across dictionaries are allowed and remain separate entries.
- Lists may mix languages; language filtering is UI/query behavior.
- Shared trusted dictionaries are immutable for users.
- User customizations belong in user-owned dictionaries, not edits to shared
  dictionaries.
- Ordinary lookup from external clients is read-only.
- Current card identity is `entry_id + card_type_id` because entries are already
  definition-level rows.
- Durable generated card IDs are deferred until the platform introduces cards
  tied to sub-entry artifacts, such as a specific example sentence or audio
  prompt.

## Browser Extension Integration Notes

Repo inspected: `/Users/khrustal/dev/translate-extension`.

Current flow:

- `src/scripts/content.js` detects selected text and sentence context.
- `src/scripts/background.js` stores the selection under
  `sidePanel_textSelected`.
- `src/scripts/sidebar.js` receives the storage update, sets
  `currentWord/currentSentence`, and calls `translateAllBoxes()`.
- Translation providers are currently independent provider calls; there is no
  2000nl lookup/status call yet.

Target extension integration:

- Add a separate 2000nl lookup/status request beside the existing translation
  flow.
- Request shape should include selected text, sentence/context, optional source
  page metadata, user/session auth, and preferred language filters.
- Response should include matching dictionary entries, dictionary/source
  metadata, list memberships, per-card-type user state, and available actions.
- Plain lookup should probably be read-only by default. Mutating actions should
  be explicit commands such as add entry to list, create/copy entry into a user
  dictionary, mark lookup as unknown, or start learning a card type.
- The same backend shape should be reusable by future consumers beyond the
  Chrome extension, including possible audio/video learning surfaces.

## Suggested Implementation Stages

### Stage 0: Review And Decision

- Review this document and `packages/shared/types/platform.ts`.
- Decide the open questions above.
- Decide whether the first schema migration targets Dutch only or generic
  multi-language support.

Validation:

- No runtime validation required; this is planning only.

### Stage 1: Dictionary Boundary

- Fix/confirm consolidated `meaning_id` schema drift before adding new
  dictionary migrations.
- Add `dictionaries`.
- Add a schema registry or at least dictionary-level schema metadata.
- Seed VanDale as a curated dictionary.
- Add nullable `word_entries.dictionary_id`.
- Backfill existing rows to VanDale.
- Add indexes for language/dictionary/headword lookup.
- Update ingestion docs and scripts to write dictionary metadata.
- Keep existing `word_lists` and `word_list_items` working.

Validation:

- Apply migration to a disposable DB.
- Run ingestion smoke checks.
- Run `cd apps/ui && npm test`.

### Stage 2: API/Service Contract

- Add shared domain types and service payload types.
- Add lookup/list/status service functions behind the current app service layer.
- Add RPC/API wrappers that return dictionary metadata and user status.
- Keep current UI payload shape as a compatibility adapter.

Validation:

- Unit tests for adapters.
- Existing training service tests.

### Stage 3: User Dictionaries

- Add user-owned dictionaries and editable entries.
- Add RLS policies for private user dictionary content.
- Add list item flows for entries from user dictionaries.
- Add UI/API flows for creating entries from the extension or training app.

Validation:

- RLS tests or SQL checks.
- List/search tests.
- Browser extension contract smoke test when available.

### Stage 4: Card State Generalization

- Done: introduce physical `user_card_status` storage keyed by `entry_id +
  card_type_id`.
- Done: add card-named wrappers for view/review/start-learning/state reads.
- Done: add `get_next_card` as a wrapper over `get_next_word`.
- Done: move platform API and current training service selection/review calls
  onto card-named wrappers while keeping legacy RPCs available.
- Done: move card-facing state reads, view tracking, start-learning, and recent
  history status joins onto physical `user_card_status`.
- Done: make `handle_card_review` write FSRS review results to physical
  `user_card_status` while preserving legacy `user_review_log` and
  `user_events` shapes.
- Done: move scheduler/get-next, legacy-named write RPCs, training stats,
  lookup status, and gated word-list filters onto `user_card_status`.
- Done: remove the `user_word_status` synchronization bridge. The old table is
  retained only as migration residue, not as runtime state.

Validation:

- FSRS parity/RPC tests.
- Training e2e smoke.

### Stage 4A: List Training Intent

- Done: keep lists as entry membership sets while adding training intent
  metadata: `default_scenario_id`, `card_policy`, and `card_type_ids`.
- Done: expose that metadata through list summary RPCs, direct UI list services,
  shared platform types, and platform list create/update actions.
- Done: current training UI applies a selected list's `default_scenario_id`.
- Done: `card_policy='restrict'` can limit scheduler card modes, but only to
  card modes currently supported by the UI renderer.
- Done: `listen-recognize` has a dedicated audio recognition renderer and
  review controls. Unsupported modes such as `listen-type` are filtered out
  instead of being rendered as text cards.
- Done: user-owned list training intent can be edited from the settings list UI.
- Remaining: add renderer support before enabling audio typing/conjugation card
  policies in the app.

Validation:

- List RPC tests.
- Training service/list/selection tests.
- Full UI test suite.

### Stage 5: External Backend Boundary

- Revive `apps/api` or add a versioned API route group for external clients.
- Expose lookup, list membership, card status, and event mutation endpoints.
- Keep service-role and auth-sensitive behavior server-side.

Validation:

- API contract tests.
- Extension integration smoke checks.

## Review Instructions For Second Agent

Start with:

- `AGENTS.md`
- `ARCHITECTURE.md`
- `docs/intent/current-transformation-targets.md`
- this file
- `packages/shared/types/platform.ts`

Review questions:

- Is the entry/list/card/status separation compatible with the current DB and
  FSRS implementation?
- Is `entry_id + card_type_id` sufficient, or should the plan introduce a
  first-class `cards` table earlier despite the current meaning-level entry
  model?
- Which schema changes can be additive with low migration risk?
- What should remain in Postgres RPCs versus a revived shared backend service?
- What hidden coupling in `apps/ui` would make this harder than the plan
  assumes?

Expected output:

- second-opinion critique,
- risk list,
- recommended first migration,
- whether to approve, revise, or reject the proposed model.
