# Sentence translation user release (#333)

Status: implementation in progress; family remains disabled until the complete release gates pass.

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
4. Focused UI tests and typecheck pass. Full UI suite passed before the final
   setup/client characterization was added; rerun it after the final edits.
   Browser/mobile QA, generated-translation and language-switch behavior remain
   release gates. Keep the family dark until they pass.
5. Pending: append migration 170's checksum/postflight to the deployment
   contract, CI/review, then deploy app and DB together and verify the test
   production.

The opposite direction, text entry and automatic grading remain out of v1.
Continuous sessions remain #468; All due is not Continuous.
