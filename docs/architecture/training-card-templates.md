# Training card templates

Owner: UI presentation. Follow-up to #332, #195 and #331; requested by the owner
on 2026-09-24. Ordinary Training visuals remain the reference. No DB, identity,
selection, scheduling or grade-dispatch changes belong in this layer.

## Small presentation contract

A family-specific pure projection binds data to `TrainingCardPrompt` (expression
or explanation), an optional labelled hint, and `TrainingCardAnswer` (header and
semantic content nodes). `TrainingCardTemplates` owns the existing ordinary-card
shell, typography, scrolling, hint, translation toggle, reveal control and review
button styles. There is no user-authored HTML, template language, CSS per family,
or registry of speculative variants.

Ordinary Training retains its capability dispatcher and listening policy.
Independent exercises use `TrainingExerciseCard`, which reports a grade to its
session controller. Display models never fabricate ordinary-card capabilities to
grade an idiom. Key this component by exact exercise target identity to reset
local hint/translation state when changing cards.

| Scenario | Face | Optional hint | Answer |
| --- | --- | --- | --- |
| Word → definition | Existing headword lockup | Existing example | Existing full ordinary meaning |
| Definition → word | Existing reverse prompt selection | Existing example | Same full ordinary meaning |
| Idiom direct | Exact expression, expression typography | Headword via lamp | Headword metadata + selected expression, its explanation and owned examples |
| Idiom reverse | Exact source explanation, explanation typography | Headword via lamp | Identical to idiom direct answer |
| Sentence translation (#333, not enabled) | Translation of exact source example in selected app language, explanation typography | Omit until a non-answer-revealing hint is agreed | Exact source sentence plus its translation using the shared answer primitives |

A hint is optional; missing data means no lamp, not a guessed fallback. An idiom
example can contain the entire answer, so it is not the reverse hint. The source
headword is metadata and a requested hint, not the main idiom recall prompt.

The full idiom answer uses the ordinary card's headword header and amber idiom
section. It replaces the face inside one card; it is not a second answer panel.
Only the resolved target and its direct explanation/example children are passed
to the projection. Neighbouring idioms, ordinary definitions, and other senses
are excluded. Existing source-node IDs and parent relationships are retained.

Translations remain secondary, behind the common answer translation toggle.
Only ready translations in the requested language with the current source
fingerprint are displayed. Reverse idiom prompts use the source explanation;
they do not silently change from Dutch into a cached translation based on cache
availability. This replaces the former bespoke idiom renderer's automatic
translated-explanation substitution and matches ordinary definition recall.

## Validation and remaining work

Characterization: existing ordinary `TrainingSenseCardStage` tests cover the
shared extraction. Idiom tests cover both directions, identical answers, no
pre-reveal answer/example leakage, explicit hints, owned-node isolation, busy
controls and translation language/fingerprint filtering. Session integration
continues to assert the existing idiom action contract.

Development preview: `/dev/sense-card-gate?prototype=exercise` is fixed fixture
presentation only. It makes no learning-state writes and is unavailable in
production. Check narrow/wide, light/dark and direct/reverse/reveal states.

Sentence translation has backend contracts, but no launchable session renderer
in this slice. Its translation readiness/retry and advertised filter parity
remain #333 work. Reuse these primitives when integrating that flow; do not
create a second visual system or enable the family just because templates exist.
