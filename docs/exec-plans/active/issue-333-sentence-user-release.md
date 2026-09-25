# Sentence translation user release (#333)

Status: migration 171 is deployed and the first live sentence-session smoke now
returns a real card without grading it. The start RPC still took 6.547 seconds.
Migration 172 restructures the remaining eligibility work around the small
learned/Known set; a read-only production `EXPLAIN ANALYZE` returned the same
974 examples in about 150 ms instead of 3.752 seconds for the source helper.
Local FSRS and deployment-contract tests pass. Final production latency remains
open until migration 172 is deployed and the start RPC is remeasured.

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
5. Deployed: contract 170 records the migration SHA and chained
   postflight; the deployment pipeline passes the sentence-family launch flag
   through Compose and both Docker build stages. The live smoke attempt at
   `2026-09-25 09:13:44 UTC` reached the scoped start RPC but timed out while
   `training_translation_source_nodes_v1` called
   `platform_v2_training_ordinary_meaning_eligible_v1` from candidate selection.
   The transaction rolled back, so no session row or learning action was
   created. Do not close the user-release gate on health status alone.
6. Complete in production: migration 171 replaces that per-example eligibility call with
   a materialized, set-based eligible-entry relation. The existing filters,
   exact source-node identity, sibling learning/Known gate, and stale-binding
   exclusion stay in place. Local coverage verifies that multiple examples on
   one eligible entry remain separate candidates and that unlearned entries
   remain excluded. After CI and test-production deployment, retry a finite
   sentence session, verify prompt/answer and translation preparation, then
   switch translation language and confirm the source exercise identity stays
   unchanged. The smoke showed a Russian prompt for Dutch recall without
   revealing or grading it, but the start RPC remained 6.547 seconds.
7. In progress: migration 172 builds the learned/Known set first, resolves its
   valid source groups, and checks each distinct dictionary once. The production
   explain returned the same 974 examples in about 150 ms. After CI and deploy,
   start a fresh finite sentence session and use the Supabase edge log's
   `response.origin_time` as the release measurement.

The opposite direction, text entry and automatic grading remain out of v1.
Continuous sessions remain #468; All due is not Continuous.

## Queue clarification — 2026-09-25

The user wants sentence practice to reinforce previously encountered meanings,
with weaker meanings receiving priority and examples rotating across meanings.
This is a refinement of the current implementation, not already delivered behavior.
Current admission accepts learning/Known state on a source-group sibling as well
as the exact entry. Current ordering uses each sentence exercise's own state and
due date, then creation time and node ID; it does not rank by parent meaning FSRS
or interleave examples by meaning. The session currently loads translations for
the current candidate on demand, without one-card lookahead.

Accepted follow-up ([ADR-0014](../../adr/0014-sentence-queue-and-preparation.md),
[discussion](../../discussions/2026-09-25-01-sentence-queue.md)): require prior learning or an explicit Known mark on the exact
meaning; preserve sentence identity and its own review state; prioritize due
sentence reviews, and rank new sentence introductions by the parent meaning's
review urgency. Introduce at most one new example per meaning per pass, rotating
through remaining examples before reusing them. Do not equate a distant due date
with a complete measure of knowledge, and do not write a second ordinary-word
review when a sentence is graded. Confirm scheduling semantics before changing
the scheduler, including how existing sentence states behave if source eligibility
changes. Existing ordinary-word progress must remain intact.

Prepare at most the next candidate's translation while the current card is shown,
using the same loader/cache boundary, deduplicated by entry/revision/language.
Lookahead must not advance the session, grade, or reorder it; revalidate the next
candidate after an action and ignore stale responses on exit/language/run changes.
Failed speculative work must remain retryable without retry storms. First-card
preparation needs an explicit loading state. Verify a single in-flight request,
cache reuse, stale-response isolation, and no progress mutation from prefetch.

Priority: finish and measure migration 171's startup fix independently, then
implement bounded translation lookahead and the agreed queue refinement. The
set-based eligibility optimization is compatible with a later narrower exact-meaning
policy; deploying it does not establish sibling admission as final product intent.
