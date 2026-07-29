# Independent Architecture Review A

Verdict: `ACCEPT WITH REQUIRED CHANGES`
Mutations: none
P0 findings: none

## Before #70

### A1 — P1 — V2 Known/undo has no versioned mutation boundary

V1 must retain legacy semantics while V2 Known is reversible state. The
candidate names V2 lookup/catalog/translation but no V2 action route, so a V2
consumer could send `mark-known` to the V1 path and apply an Easy review.

Required: define `/api/platform/v2/actions`, prohibit V2 capabilities from
using legacy mappings, and gate Known/undo exposure on #89.

### A2 — P1 — Lookup does not determine the projected card type

One SenseCard is `(entryId, cardTypeId)`, but the V2 request has no card type
and the response has one singular card.

Required: require and echo `cardTypeId`, or return an explicit collection.
Guest behavior must use the same selection rule.

### A3 — P1 — Cross-reference and generated-draft result algebra is incomplete

`CrossReferenceEntryV2` is named but undefined. Generated drafts have a target
fragment but no complete response variant.

Required: define complete discriminated variants, capability absence, identity
lifetime, and `senseCount` behavior.

### A4 — P1 — Group completeness and pagination remain unresolved

The server currently caps strict lookup at ten even though a real `goed`
collision set contains twelve. The V2 response has no completeness metadata.

Required: paginate whole groups rather than entry fragments, expose explicit
completeness/cursor semantics, and test authenticated/catalog results above ten.

### A5 — P1 — Capability types allow invalid action/target combinations

Independent unions allow mark-known on a node, translation on a SenseCard, or
review parameters on unrelated actions. Entry-only Report cannot be expressed.

Required: an action-discriminated union with entry, SenseCard, node, and
translation targets; parameters and idempotency must be action-specific.

### A6 — P1 — Known is incorrectly modeled as an exclusive phase

Known is a reversible overlay over preserved scheduling state, but the
candidate places it in the same scalar phase as hidden/frozen and lacks an
active mark identity for stale-undo protection.

Required: keep scheduler phase separate from `knownMark`; undo targets the
active mark and current state revision.

## During #70

### A7 — P2 — Duplicate-node reorder requirements are contradictory

Indistinguishable duplicate nodes cannot both preserve distinct identity after
reorder without evidence.

Required: guarantee preservation only with native or unambiguous evidence;
otherwise fail closed and reissue/retire the affected bindings.

### A8 — P2 — Word Details ownership is not implementable as written

`WordDetailsV1` is undefined and entry/group ownership is left to source
interpretation.

Required: define the minimal typed schema and anchors, or omit unproven fields
from initial V2.

### A9 — P2 — AudioFilms localization is not an explicit migration gate

Current AudioFilms types and projection require English visible labels.

Required: make semantic IDs/message keys the backend contract and resolve
visible/accessible copy only in the extension renderer.

### A10 — P2 — Cross-repository rollback lacks a deployable state machine

Disabling V2 after a consumer deletes V1 fallbacks would cause an outage.

Required: test the server/consumer deployment matrix and keep a deployable V1
adapter or continuous V2 route through each rollback window.
