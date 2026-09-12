# ADR-0011: Give content exercises their own stable target identity

- Status: Accepted
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

## Database realization

Migration `151_content_bound_training_exercise_contract.sql` realizes the
storage contract additively through `private.platform_v2_training_exercise_targets`,
`user_training_exercise_state`, `training_session_exercise_members`, and
target-bound action/receipt tables. The target read boundary is
`read_platform_v2_training_exercise_target_v1`; it is service-role-only until a
consumer vertical slice supplies the action and scheduler behavior.

Migration `152_idiom_training_exercise_runtime.sql` adds the idiom candidate
and self-assessed action boundaries. Candidate selection requires an ordinary
meaning in the same headword group to be enrolled or Known, requires an active
idiom explanation, and returns source locators for the normal V2 content read.
Each idiom direction has independent additive FSRS state; action retries are
idempotent and do not mutate ordinary meaning state, Known marks, or ordinary
review history. The wrappers are service-principal-only until the application
consumer and launch UI are enabled.

When a source Content Node is retired, associated targets become invisible but
remain present, and their learner state/history remains protected by
`ON DELETE RESTRICT`. A changed source fingerprint retires the old target and
requires an explicit new node mapping; it never silently rebinds old FSRS data.

## Verification boundary

The first implementation slice publishes the type/helper contract and tests
for ordinary compatibility, multi-idiom collision freedom, independent
directions, and language-independent translation identity. Migration 152 adds
the idiom candidate/action preservation fixture. Sentence translation remains
owned by #333; launch visuals remain owned by #331.
