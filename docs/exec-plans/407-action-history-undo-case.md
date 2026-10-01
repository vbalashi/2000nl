# Known / exclusion history and undo — owner comment 16

Requested: every accepted Mark known / Exclude word action appears in History, with an Undo action. Owner explicitly allowed this to be a separate follow-up case.

## Existing behavior

History (`lib/training/trainingHistoryService.ts`) currently projects learning_started and four review outcomes; it does not project Known/exclusion activities. Mark known has durable `user_card_known_marks` and `platform_v2_action_receipts` (migration 113, directional semantics in 193). Headword exclusions have durable private exclusions and exclusion events (192). `TrainingExclusionUndoNotice` supports immediate restoration through the canonical authenticated exclusion action, but its notice store is transient and is not a history read model.

## Separate implementation scope

1. Add a principal-scoped server projection combining review activity and accepted Known/exclusion/restore events; stable event identity, chronological pagination and immutable original records.
2. Display the concrete headword, direction/scope, action and time. Known may be directional; headword exclusion covers both ordinary word directions. Do not equate either with a completed review.
3. Derive undo eligibility from current authoritative state. Undo Known uses the existing undo-known action; undo headword exclusion uses restore-headword with the original exclusion ID. Never delete history or replay a stale inverse against a newer action.
4. Preserve idempotency, ownership, cross-client receipt provenance, and explicit restoration history. Return truthful already-restored / superseded states; double-click and refresh must not create duplicate actions.
5. Validate RLS/principal isolation, paginated mixed history, directional Known, both-direction exclusions, restoration after reload, retry/double-submit and intervening actions. Characterize existing contracts before adding the projection.

## Product decision to confirm before this follow-up

Proposed: allow Undo from History while the original action is still active; once undone or superseded, keep the row and show its resulting state. No arbitrary time limit. This case is recorded, not implemented as part of the visual correction round.
