# ADR-0011: Give content exercises their own stable target identity

- Status: Proposed
- Date: 2026-09-12
- Decision owner: 2000NL product owner, recorded in #385

## Context

Ordinary meaning exercises currently use the durable identity
`entry_id + card_type_id`. That is correct for the two directions of one
Dictionary Meaning and must remain compatible with existing learner state.

Idioms and sentence translations are different Training Exercise families. A
Dictionary Meaning may contain several idioms, and one sentence may have
different generated Translation Artifacts over time. Giving these exercises
only a new string `card_type_id` would make every idiom under one entry share
one FSRS state, Known/action target, receipt, and session member.

## Decision

Use one shared identity vocabulary for content-bound exercises:

```text
training-exercise-v1:<family>:<direction>:<entry-id>:<content-node-id>
```

- `family=meaning` keeps the existing entry-level ordinary identity and uses
  `content-node-id=entry` in the canonical key for compatibility;
- `family=idiom` requires the exact `idiom` Content Node and supports
  `direct` and `reverse` exercises;
- `family=translation` requires the exact source sentence Content Node and
  uses one `recall` direction in v1;
- translation language is presentation/configuration, not identity;
- each direction is a separate exercise, while changing the presentation
  language does not create a new Translation Exercise;
- content-node IDs and source fingerprints are authoritative; visible text,
  array position, and neighboring nodes are not identity.

Existing ordinary state, Known marks, action events, receipts, history, and
session membership remain readable and are not rewritten by this contract.
Content-bound state must be additive and use the same accepted action/session
semantics. A future migration may retire a content-bound target only through
an explicit source-node mapping; it must never clone one legacy state into
multiple idiom targets or delete the old history.

## Consequences

Two idioms under one meaning can have four independent targets (direct and
reverse for each idiom). #332 owns idiom eligibility, presentation, and any
legacy ordinary-mode transition. #333 owns sentence selection and translation
presentation. Both consumers share this identity and must not introduce
competing card registries or FSRS tables.

This ADR intentionally does not add idiom/translation launch UI or change the
current ordinary scheduler. Those changes follow after the identity contract,
preservation tests, and visual approval are ready.

## Verification boundary

The first implementation slice publishes the type/helper contract and tests
for ordinary compatibility, multi-idiom collision freedom, independent
directions, and language-independent translation identity. Database status,
action, and session integration require a separate additive migration with a
disposable preservation fixture before #332 or #333 is enabled.
