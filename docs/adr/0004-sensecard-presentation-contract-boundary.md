# SenseCard Presentation Contract Boundary

Status: accepted
Date: 2026-07-29
Related: ADR 0002 generated drafts; ADR 0003 source-entry bindings

## Context

2000NL and AudioFilms need the same semantic dictionary-card anatomy without
sharing one runtime renderer. The current Platform V1 lookup envelope is an
important compatibility boundary, but it still exposes provider `raw`, broad
technical action lists, array-position section IDs, and translation overlays
that mirror source arrays. AudioFilms currently compensates through its own
transition projection.

Changing the meaning of existing V1 fields would make old and new clients
indistinguishable. Computing groups or content identity in either client would
also repeat the same inference problems the shared contract is intended to
remove.

## Decision

### Publish an explicit Platform V2 family

The semantic SenseCard contract is published through explicit V2 routes,
starting with:

```text
/api/platform/v2/lookup
/api/platform/v2/catalog/lookup
/api/platform/v2/translation
/api/platform/v2/actions
```

There is no content negotiation. Platform V1 and the current unversioned
aliases retain their existing semantics while consumers migrate. Stable
operations whose request and response semantics do not change do not need to
be duplicated merely to make every route number match.

Authenticated routes preserve the existing server-derived principal and
Connected Client scope boundary: reads require `platform:read`; actions,
translation generation, generated-draft persistence, and other writes require
`platform:write`. Capability presence never substitutes for authorization.

V1 removal or semantic deprecation is a later decision, made only after the
consumer inventory proves that no supported client depends on it.

### Platform owns Headword Group identity

Every returned presentation group has an opaque `headwordGroupId`. Clients do
not group entries from visible spelling, part of speech, dictionary labels, or
result order.

For source-managed entries, the public group identity is backed by the
versioned source-group binding without exposing the adapter's
`source_group_key`. User-owned groups are private durable records scoped to the
owning dictionary/user. The first V2 writer creates one group for every
user-owned entry on create, copy, or generated-draft save. Edits and renames
preserve the group ID. No writer automatically groups by spelling. Combining
user-owned meanings is deferred until an explicit regroup operation has its
own history and conflict semantics. Generated drafts use revision-scoped draft
group identity and return an explicit mapping to the permanent group on save.

Before V2 exposure, existing user-owned entries are backfilled one-to-one:
each receives its own private durable group. Count, uniqueness, ownership, and
cross-user privacy checks must pass; visible spelling is not a backfill key.
Generated-draft save is retry-safe and returns the original permanent
group/entry/node mapping for the same principal, candidate revision, and
idempotency key; key reuse with another payload conflicts.

Separate homographs and entries from different dictionaries remain separate
groups even when the displayed headword is identical. A client may place such
groups next to each other, but must not merge their content or targets.

The Headword Group remains a presentation/search aggregate and is not a
learning target.

### Platform owns durable Content Node identity

Every renderable definition, Usage Pattern, example, idiom, note, and other
supported semantic element has an opaque `contentNodeId`.

```text
entryId + contentNodeId + sourceTextFingerprint
```

- `entryId` owns the Dictionary Meaning and learning target.
- `contentNodeId` identifies the semantic element and survives harmless source
  reordering.
- `sourceTextFingerprint` determines whether node-bound derived content, such
  as a translation, is still valid.
- source paths and array indexes are diagnostics only.

The server persists node bindings. On import or edit, it preserves an ID only
when source-native evidence or unambiguous semantic reconciliation identifies
the same element. New or ambiguous elements receive new IDs; the Platform does
not guess by array position. Removed bindings are retained for historical
resolution according to the eventual node-retirement policy.

### Known is reversible overlay state, not an FSRS grade

The approved SenseCard behavior treats “mark known” as a reversible decision
about one exact `(entryId, cardTypeId)` target. Platform V2 therefore exposes a
`knownMark` alongside, rather than instead of, the preserved scheduler phase.
The mark has an opaque ID and revision; `undo-known` targets that active mark.

The database operation must be atomic:

- `mark-known` records a durable current mark and an immutable action event;
- it excludes the card from training without applying an `easy` review or
  otherwise rewriting the preserved FSRS/learning state;
- `undo-known` clears the currently active mark and records its own immutable
  event;
- clearing the mark makes the preserved prior state active again;
- a stale undo cannot clear a later replacement mark;
- idempotent retries return the already accepted result without applying a
  second mutation.

Idempotency is bound to the canonical payload. Reusing a key with a different
action, target, result, or normalized source context conflicts without a
write. When a V2 action carries `source-context-v2`, action state, immutable
history, and normalized provenance are persisted atomically. Observation and
diagnostic fields do not change semantic idempotency.

`hidden` remains a separate scheduler state. Platform V1 retains its existing
legacy `mark-known -> easy` and `mark-unknown -> fail` behavior until its own
deprecation for cards without an active V2 Known Mark. An active mark is
excluded by shared database selection regardless of adapter version; legacy
review/start attempts against it fail closed. V2 must not present those legacy
mappings as the approved Known interaction.

Because the mutation semantics change, V2 Known/undo is available only through
`/api/platform/v2/actions`. Migration `109` supplies the durable boundary, and
`PLATFORM_V2_ACTIONS_ENABLED` gates both the endpoint and the mutation
capabilities returned by lookup. V2 lookup must not advertise those
capabilities while the boundary is darkened.

### Lookup is complete at Headword Group boundaries

V2 strict lookup requires and echoes the presentation `cardTypeId`. It returns
whole Headword Groups and never truncates one group's entries at an item
limit. Pagination, when required, is opaque and group-atomic. The response
states whether the selected strict tier is complete and whether more complete
groups remain.

A group larger than the operational safety bound produces an explicit error;
it is never returned partially. Authenticated and catalog lookup follow the
same completeness rules.

## Compatibility And Migration

V2 is additive at the route level:

1. publish V2 types, fixtures, and route contract tests;
2. migrate the 2000NL renderer to the V2 presentation projection;
3. migrate the AudioFilms backend projection while keeping the extension
   response boundary local to AudioFilms;
4. remove AudioFilms `raw`, positional, and same-kind ordinal fallbacks;
5. inventory remaining V1 clients before any V1 retirement proposal.

V1 and V2 may coexist during migration, but one renderer must consume one
contract version for a given card. Mixing V1 identity with V2 content or
actions is not allowed.

## Consequences

- Both products can render independently from one semantic source of truth.
- Headword spelling, labels, source paths, and array order stop acting as
  accidental identifiers.
- Translation, reporting, and future personal overlays can target exact
  content.
- Known/undo has a real database rollback path without erasing action history
  or manufacturing FSRS reviews.
- The Platform must add and operate a content-node binding store rather than
  relying only on deterministic display hashes.
- V1 compatibility has an explicit carrying cost until both consumers migrate.

## Implementation-Owned Follow-Through

- #70 owns exact schema spelling, fixtures, adapters, and the rollout matrix
  within the accepted ownership/cardinality boundaries.
- #89 owns the durable Known/undo migration, mutation, and rollback evidence.
- Content Node retirement operations remain fail-closed until historical
  resolution policy and evidence are implemented.
