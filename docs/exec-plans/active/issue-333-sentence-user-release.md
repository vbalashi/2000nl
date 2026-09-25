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

1. Exact source resolution and translation readiness, with stale/sibling/language
   tests; typed presentation through existing templates.
2. Shared server entry filters for sentence sessions, authoritative statistics,
   idempotent start/grade and single-active-run parity. Existing migration 166
   exposes only user, size and request ID on its public start RPC; do not enable
   the UI before this filter gap is closed.
3. Client session consumer, bounded translation preparation and shared card
   actions. Keep family disabled while a slice is incomplete.
4. Component and SQL tests for source identity, all displayed filters, language
   switching, cached/generated translation, retries, stale runs, Exclude/Undo
   and statistics; mobile en/nl/ru visual QA.
5. One independently deployable release containing the enabled UI and its exact
   DB contract; CI, deploy and production verification before declaring complete.

The opposite direction, text entry and automatic grading remain out of v1.
Continuous sessions remain #468; All due is not Continuous.
