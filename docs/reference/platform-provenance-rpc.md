# Platform Provenance RPC

Status: current-state reference, 2026-06-23.

This note explains the active database behavior behind Platform card actions
with provenance. It is a guide to the live migration state, not a replacement
for the schema, migrations, or tests.

## Entry Points

The HTTP Platform action route calls `perform_platform_card_action(...)` only
when a request carries `clientEventId`. Requests without `clientEventId` keep
using the older direct mutation RPCs:

- `record_card_view(...)`
- `start_learning_entry_card(...)`
- `handle_card_review(..., p_turn_id)`

The active provenance RPC signature used by the Platform route is:

```sql
perform_platform_card_action(
  p_user_id uuid,
  p_entry_id uuid,
  p_card_type_id text,
  p_action text,
  p_result text,
  p_turn_id uuid,
  p_client_event_id text,
  p_source_context jsonb,
  p_auth_kind text,
  p_connected_client_id text
)
```

The lower-level eight-argument overload performs the core mutation,
idempotency check, source/location creation, and event insert. The ten-argument
overload adds authoritative actor fields and v2 artifact linkage.

## Supported Actions

The DB RPC supports these card actions:

- `record-view`
- `start-learning`
- `mark-known`
- `mark-unknown`
- `review-card`

`mark-known` maps to review result `easy`. `mark-unknown` maps to `fail`.
`review-card` accepts `fail`, `hard`, `success`, `easy`, `freeze`, or `hide`.

Other Platform HTTP actions, such as list and user-dictionary mutations, do not
go through this provenance RPC today.

## Current State Versus History

Mutable current card state lives in `user_card_status` and the FSRS/review
tables used by `handle_card_review`.

Immutable source-linked action history lives in:

- `learning_sources`
- `learning_source_artifacts`
- `learning_source_locations`
- `user_card_action_events`

Do not denormalize a single current `source_id` onto `user_card_status`. One
card can be encountered from multiple sources over time.

## Atomicity

The RPC keeps these steps in one database transaction:

1. validate user/card/action access;
2. build the action idempotency payload hash;
3. check `clientEventId` duplicate/conflict state;
4. normalize or upsert source and location rows when source context is present;
5. run exactly one card-state mutation;
6. insert exactly one `user_card_action_events` row;
7. attach actor and artifact fields in the ten-argument wrapper.

If the card mutation fails, the source/action event insert rolls back with it.
If provenance insertion fails, the card mutation rolls back too. Future changes
must preserve this mutation plus provenance atomicity.

## Write Order

For accepted non-duplicate actions, the core eight-argument function writes in
this order:

1. `learning_sources`, when `sourceContext.source` is present.
2. `learning_source_locations`, when location or bounded context text exists.
3. Card mutation:
   - `record_card_view(...)` for `record-view`;
   - `start_learning_entry_card(...)` for `start-learning`;
   - `handle_card_review(...)` for `mark-known`, `mark-unknown`, and
     `review-card`.
4. `user_card_action_events`.

The ten-argument wrapper then:

1. validates `auth_kind` and `connected_client_id`;
2. rejects v2 review actions whose review turn was already consumed outside the
   matching action event;
3. calls the core eight-argument function;
4. creates or links `learning_source_artifacts` for
   `source-context-v2.artifact`;
5. updates `user_card_action_events.auth_kind`,
   `connected_client_id`, and `artifact_id`.

## Idempotency

`clientEventId` is scoped by `(user_id, client_event_id)` in
`user_card_action_events`.

When `clientEventId` is present:

- the RPC takes an advisory transaction lock on `user_id + clientEventId`;
- an identical duplicate returns `{ "status": "duplicate", ... }`;
- a duplicate with a different payload hash raises
  `platform_action_idempotency_conflict`;
- no second card mutation is applied for a duplicate.

For legacy or v1 source context, the payload hash is an MD5 over the action
tuple plus raw `sourceContext`.

For `source-context-v2`, the payload hash is SHA-256 over semantic fields only:

- contract version;
- user, entry, card type, action, result, effective turn id;
- source;
- artifact;
- location;
- selection;
- bounded context.

Observation and diagnostics are intentionally excluded from v2 idempotency.
Retries that differ only by title, playback observation, warnings, or debug
diagnostics should resolve to the same duplicate event.

## `clientEventId` And `turnId`

`turnId` remains the review idempotency value used by `handle_card_review`.

For provenance-aware review-like actions:

- `review-card`
- `mark-known`
- `mark-unknown`

the effective review turn id is `turnId` when supplied, otherwise UUID-shaped
`clientEventId`.

For `source-context-v2` review-like actions:

- `clientEventId` must be a UUID;
- if `turnId` is supplied, it must equal `clientEventId`;
- if that turn id already exists in `user_review_log` but no matching
  `user_card_action_events` row exists, the RPC raises
  `platform_review_turn_already_consumed`.

This prevents accepting a provenance event for a review mutation that was
already consumed through another path.

## Trusted Actor Fields

The authoritative actor is not read from JSON. It is passed by the server-side
Platform auth layer into the ten-argument RPC:

- `auth_kind`: `first_party` or `connected_client`;
- `connected_client_id`: required for `connected_client`, null for
  `first_party`.

The HTTP layer also rejects a `sourceContext.client.id` mismatch for connected
clients. That field remains client-reported observation; the persisted actor is
`user_card_action_events.auth_kind` and `connected_client_id`.

## Source Context V1 Versus V2

`source-context-v1` is permissive and legacy-compatible. It stores raw source
context on the event and uses the raw source context in the legacy payload hash.

`source-context-v2` is the strict contract for new producers. Its important
properties are:

- source identity is canonicalized;
- artifact identity is separated from source identity;
- location, selection, bounded context, observation, and diagnostics stay
  separate;
- observation and diagnostics do not control idempotency;
- direct RPC callers cannot poison canonical source metadata.

The HTTP normalizer in `apps/ui/lib/platform/platformApi.ts` should normalize
v2 before calling the RPC. The DB trigger is defense in depth for direct RPC
callers.

## Source Canonicalization

The v2 `learning_sources` trigger normalizes source rows before insert/update.

For `youtube_video`:

- `provider` must be `youtube`;
- `external_id` must be an 11-character YouTube id;
- `canonical_url` is derived as
  `https://www.youtube.com/watch?v=<external_id>`;
- client title is stripped;
- language code is lowercased and normalized from `_` to `-`;
- metadata is reduced to `{ "contractVersion": "source-context-v2" }`.

For private source kinds:

- `web_page` requires provider `web`, a
  `private:web_page:<sha256>` external id, and a safe `http(s)` canonical URL
  without credentials or fragments;
- `text_document` requires provider `pontix`, a
  `private:text_document:<sha256>` external id, and no canonical URL;
- `ebook` requires a provider, a `private:ebook:<sha256>` external id, and no
  canonical URL;
- title is stripped;
- metadata is reduced to
  `{ "contractVersion": "source-context-v2", "privateSource": true }`.

Pontix product work remains deferred; accepting private source kinds at this
layer is not a statement that Pontix UI/client readiness is complete.

## Artifact And Location Rows

For v2 actions with an `artifact` object, the wrapper creates or updates
`learning_source_artifacts` using a SHA-256 identity key over source id plus
artifact JSON. It records fields such as:

- artifact kind;
- producer;
- snapshot revision id;
- text source id/revision;
- text content fingerprint;
- timing evidence revision id;
- phrase-set revision id;
- builder version;
- language code;
- quality.

If a location row was created, the wrapper attaches the artifact id to that
location. The wrapper also attaches `artifact_id` to the action event.

Locations are keyed per source by locator kind, timing/phrase index, and bounded
context text hash. Diagnostics may be stored in location metadata, but they
must not control v2 idempotency.

## Duplicate And Conflict Behavior

Expected outcomes:

| Case | Result |
| --- | --- |
| First accepted `clientEventId` | Applies one card mutation and inserts one event |
| Exact retry with same payload hash | Returns `status = duplicate` and existing ids |
| Retry with same `clientEventId` but changed semantic payload | Raises `platform_action_idempotency_conflict` |
| v2 review-like action with mismatched `turnId` | Raises `v2_turn_id_mismatch` |
| v2 review-like action with non-UUID `clientEventId` | Raises `v2_client_event_id_must_be_uuid` |
| v2 review-like action with already-consumed external review turn | Raises `platform_review_turn_already_consumed` |
| Invalid v2 canonical/private source row | Raises `invalid_v2_canonical_source` or `invalid_v2_private_source` |

The HTTP layer maps the common conflict cases to 409 responses.

## Migration Anchors

Read migrations in order when changing this area:

- `db/migrations/007_review_idempotency.sql`
- `db/migrations/045_handle_card_review_on_card_status.sql`
- `db/migrations/047_legacy_write_rpcs_use_card_status.sql`
- `db/migrations/076_start_learning_sets_in_learning.sql`
- `db/migrations/077_external_card_action_provenance.sql`
- `db/migrations/078_platform_principal_connected_client_scope.sql`
- `db/migrations/079_source_context_v2_artifacts.sql`
- `db/migrations/080_source_context_v2_review_exactly_once.sql`
- `db/migrations/081_source_context_v2_semantic_idempotency.sql`
- `db/migrations/082_source_context_v2_source_canonicalization.sql`
- `db/migrations/083_source_context_v2_private_sources.sql`

Do not rewrite historical migrations for neatness. Add a new migration only
when active behavior must change.

## Test Anchors

Important coverage lives in:

- `apps/ui/tests/fsrs/fsrsRpc.test.ts`
  - review turn idempotency;
  - direct provenance RPC duplicate/conflict behavior;
  - v2 idempotency ignoring observation/diagnostics;
  - direct RPC source canonicalization defenses;
  - private source redaction defenses.
- `apps/ui/tests/api/platformActionsRoute.test.ts`
  - HTTP action request validation and conflict mapping.
- `apps/ui/tests/api/platformV1Routes.test.ts`
  - versioned Platform route snapshots.
- `apps/ui/tests/api/platformLearningRoutes.test.ts`
  - read-model behavior over action events.

For provenance or trust-boundary changes, route tests alone are not enough.
Run DB/RPC tests that exercise the active SQL behavior.
