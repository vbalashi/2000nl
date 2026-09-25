# Sentence translation user release (#333)

Status: implementation and local gates complete; ready for coordinated test-production release after final PR/CI review. The local fixture corpus has no translated examples, so real answer-card QA remains a production verification step.

## Product contract

The first release has one direction: the selected translation language on Face,
the original Dutch example on Answer. This is the existing `translation/recall`
exercise identity, not idiom `direct/reverse`. UI should show the actual language
direction rather than ambiguous direct/reverse terminology. Russian is an example,
not a hardcoded language. Changing translation language preserves source identity,
FSRS, history and due dates.

Face contains exactly the selected example's translation. Answer shows exactly
that original example and its translation together, with the source headword as
context. Do not render sibling examples in the answer or require scrolling through
the dictionary article to locate the answer. Full dictionary content belongs in
the existing details action. Use existing example typography and color tokens.

The shared card and session own reveal, grade buttons, audio, translation,
details, Report, Exclude/Undo, progress and New/Review/Total. Sentence content is
a projection into those components, not an independent visual session.
The answer's translation is visible when revealed: no additional translation
click is required to compare the prompt and original. Audio reads the selected
Dutch example. Report targets that source example with the canonical entry
attestation. Exclusion applies to the semantic pair, preserving scheduling/history.

## Source and translation boundaries

Resolve the exact entry, source example ID and fingerprint from the public
content-node projection. Never choose the first example or borrow another node's
translation. Missing translation is a preparation state, not ineligible content.
Pending/failed/stale translations cannot become answerable prompts. Preparation
uses the existing translation cache/provider boundary; retry has no grade or
progress side effects. Late responses must be guarded by active run generation.

Source-word learning/Known eligibility remains server-owned. All displayed
dictionary/collection, POS/article, activity and session mix filters must reach
server selection, and presets must round-trip them. No empty-scope fallback.

## Implementation sequence and release gates

1. Complete: exact source resolution, readiness checks and typed presentation
   through the shared card. Focused tests cover wrong-language/missing
   translations and selected-node isolation.
2. Complete locally: migration 170 carries all material/lexical/activity/mix
   filters into translation-session selection and statistics, retaining pair
   exclusion, idempotent start, and authenticated grants. The clean local DB
   harness passes 254/254 tests; migration 170 postflight passes.
3. Implemented: finite translation session, exact-node lookup, translation
   preparation/retry without consuming a member, shared reveal/grade shell,
   session restore, statistics, audio, Report, and pair Exclude/Undo.
4. Complete locally: all 138 UI test files pass (1,172 passed, 242 skipped),
   typecheck passes, lint passes with one existing hook-dependency warning,
   and the full local DB harness and migration-170 postflight pass. Local UI
   launch reaches the sentence session and shows the designed empty state; the
   local corpus contains no translated examples, so it cannot show a real card.
5. Complete locally: contract 170 records the migration SHA and chained
   postflight; the deployment pipeline passes the sentence-family launch flag
   through Compose and both Docker build stages. Production migration, live
   translated-card rendering, generated-translation retry and language-switch
   verification remain the deployment smoke gate.

The opposite direction, text entry and automatic grading remain out of v1.
Continuous sessions remain #468; All due is not Continuous.
