# Independent Architecture Review B

Verdict: `ACCEPT WITH REQUIRED CHANGES`
Mutations: none
P0 findings: none

## Before #70

### B1 — P1 — V2 Known capabilities have no safe V2 mutation route

The V2 route family omits actions even though Known semantics differ from V1.

Required: add `/api/platform/v2/actions` or an equivalently unambiguous
operation and gate capability exposure on #89.

### B2 — P1 — Capability targets cannot express declared actions safely

Entry translation, entry-level Report, and Word Details cannot use the current
SenseCard/content-node-only target union. Invalid pairings remain type-valid.

Required: use an action-discriminated union, add entry targets, and require
mutation idempotency.

### B3 — P1 — User/generated Headword Group identity has no lifecycle

Source groups have a binding ledger. User entries, copies, edits, renames, and
generated saves do not yet have an equivalent durable rule.

Required: define non-source group assignment, preservation, regroup semantics,
ownership/privacy, and draft-to-persisted mapping. One user entry per group is
the smallest safe initial policy if multi-meaning authoring remains deferred.

### B4 — P1 — V2 lookup can silently omit valid groups

The current ten-entry cap can drop accessible homographs or dictionaries, and
V2 has no completeness metadata.

Required: return the complete selected tier under a proven bound or provide
group-atomic pagination/completeness metadata, with >10 fixtures.

## During #70

### B5 — P2 — Cross-reference and generated-draft variants are incomplete

Required: define complete discriminated response types before route exposure,
or explicitly retain/remove the older draft contract from initial V2.

### B6 — P2 — Entry-level translation state is undefined

The approved short entry translation is distinct from node translations, but
`EntryTranslationStateV2` is only a name.

Required: define identity, target, status/text/error, fingerprints, policy
version, and freshness separately from node translations.

### B7 — P2 — `WordDetailsV1` is an undefined public placeholder

Required: publish a minimal typed owner-aware schema or omit it and its
capability until #84. Never publish `unknown`/`raw`.

### B8 — P2 — Rollback is not operationally sequenced

Required: enable the V2 server first, migrate adapters behind independent
switches, roll consumers back before routes, and preserve IDs after exposure.

## Tracked Follow-Up

### B9 — P3 — Mixed-POS group header is underspecified

The vocabulary allows multiple POS values, while the candidate header has one.

Required before a mixed source is onboarded: group POS only when uniform and
support an entry-level override, or define durable projection-split identity.
