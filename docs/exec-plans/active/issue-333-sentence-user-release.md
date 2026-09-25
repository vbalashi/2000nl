# Sentence translation user release (#333)

Status: migrations 172 and 173 are deployed. The same live start RPC improved
from 6.547 seconds to 2.160 seconds and then to 441 ms while returning a real
sentence card without grading it. Startup localization is complete for this
release. One-card translation lookahead is deployed and verified through the
existing lookup/translation cache boundary. The next stage is Word in Context under ADR-0015, not further development
of independent sentence scheduling. The deployed runtime below still uses
independent translation targets; the accepted replacement is not implemented.

## Deployed sentence product contract (superseded for the next mode)

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
7. Complete in production: migration 172 builds the learned/Known set first, resolves its
   valid source groups, and checks each distinct dictionary once. The production
   explain returned the same 974 examples in about 150 ms. After CI and deploy,
   start a fresh finite sentence session and use the Supabase edge log's
   `response.origin_time` as the release measurement. The fresh session start
   completed in 2.160 seconds, down 67% from 6.547 seconds.
8. Complete in production: migration 173 batches target creation/reactivation and state
   projection for the selected cards. A rollback-only production measurement
   showed the existing candidate function at 3.389 seconds while the equivalent
   ranked source query was 0.168 seconds; ten already-existing target ensures
   took only milliseconds in isolation. The change removes the PL/pgSQL
   per-candidate boundary and its unconditional target writes. Deploy, repeat a
   fresh finite-session smoke without grading, and record edge origin time. The
   deployed RPC completed in 441 ms (80% below migration 172 and 93% below the
   original 6.547-second measurement).
9. Complete in production: while the current sentence is visible, select exactly the
   next still-available latched member and warm its translation through the
   existing library lookup and translation API. A per-run/member/language key
   prevents duplicate speculative calls. The result never updates UI, advances
   the session, marks a member unavailable, or writes a review; after an action,
   the normal next-member RPC and exact fingerprint loader remain authoritative.
   Focused component/loader tests cover one-card bounding, ready-cache reuse,
   missing-translation generation, and absence of progress mutations. In the
   live smoke, card 1 remained visible and unconsumed while the translation row
   for card 2's entry (`caa866a3-2343-43eb-b89e-170f3c4dbc56`) became ready.
   The post-smoke database check found zero consumed session members, zero
   exercise actions and zero ordinary reviews.

The opposite direction, text entry and automatic grading remain out of v1.
Continuous sessions remain #468; All due is not Continuous.

## Next stage — accepted 2026-09-25: Word in Context

Authority: [ADR-0015](../../adr/0015-word-in-context-shared-reverse-state.md),
[discussion evidence](../../discussions/2026-09-25-03-word-in-context.md).
Do not implement the superseded independent sentence queue refinement.
The owner confirmed that no sentence grades have been made, so no historical
grade transfer or FSRS reconciliation is needed
([transition discussion](../../discussions/2026-09-25-04-word-context-transition.md)).

### Transition contract before implementation

- Give the new presentation a distinct persisted setup/resume identity,
  `word-in-context`. It starts an ordinary `meaning` session containing only
  `definition-to-word` members. Do not reuse the existing `sentence` family
  identifier, because it still identifies independently scheduled translation
  targets and their session snapshots. The UI may present a user-facing name
  without exposing this internal identifier.
- Keep ordinary queue order, due rules, card filters, lexical/material filters,
  session size, exclusion and replacement behavior. Only values with an active
  example eligible for translation may enter the context session. Check this
  during server selection before latching members; filtering a normal meaning
  session after start would produce missing cards, broken totals and a biased
  queue. Familiarity with one meaning must never grant access to a sibling.
  The selected example is presentation data, not another unit in the queue.
- The currently deployed `sentence` resume record remains readable by its
  existing handler until a new run supersedes it; old records must not be
  reinterpreted as `word-in-context`. A new context resume record carries the
  ordinary session ID and mode, so reload restores the same queue and the
  selected example. Existing ordinary/sentence states and action history stay
  intact, even though no old grades need transferring.
- An accepted grade uses the ordinary reverse capability for the exact entry,
  the active ordinary session ID and one client event ID. It consumes exactly
  one ordinary member and writes exactly one reverse FSRS/history action.
  Store presentation mode, exact source node/fingerprint and hint-opened flag
  as bounded evidence of that action. Retrying the same event must not grade
  twice or change which example was shown. Never derive the target entry or
  action authority from a client-supplied example ID.
- Freeze the chosen example for each active member across reveal, retries and
  reloads. Advance example rotation only when the ordinary member is actually
  consumed. A missing/stale translation blocks answerability without grading;
  the existing translation API can prepare it and bounded lookahead may warm
  the following member. Inactive/retired source nodes are unavailable, with
  server-owned replacement accounting.

The current ordinary session schema has no presentation-mode discriminator,
and the old sentence session uses a different member/state table. Do not use
only local storage to distinguish the modes: session snapshot and action
validation must enforce the same server-owned contract. Inspect the ordinary
start/action functions before choosing a new parameter or persisted column;
preserve old RPC signatures for existing clients.

### Implementation checkpoint — 2026-09-25

- Migration 174 reuses the ordinary reverse scheduler with a context-only,
  exact-meaning example eligibility check. Migration 175 freezes one active
  source node/fingerprint per member and exposes an authenticated read; both
  are in the deployment contract and local FSRS tests.
- The UI branch adds a distinct setup/preset/resume identity, passes the
  presentation marker only to session start, loads the exact selected node and
  its translation, and reuses the ordinary card and session shell. An
  unavailable translation is a preparation state with no answer controls.
- Migration 176 copies the frozen presentation source and the hint-opened bit
  into the existing ordinary action event in the same transaction that consumes
  the ordinary member. Hint recording does not change the FSRS state.
- The client now warms only the next still-available latched example while the
  current prompt is visible. A missing or retired source enters the ordinary
  unavailable-member replacement path; a pending translation remains retryable
  without a grade.
- This is **not yet a completed user release**. CI, an authenticated production
  smoke, and measured startup/transition times remain release gates. The simple first rotation cursor follows existing reverse review
  count; refine it if we require rotation only after a context presentation.

Production checkpoint: PRs #509–#511 passed CI and deployed to test production.
An authenticated no-grade smoke showed the translated prompt, shared card
actions and the exact selected Dutch example; reload restored the same prompt
without changing progress. First-card latency remains a separate nonblocking
#413 investigation. The owner then clarified that the Face needs a POS chip and
definition hint, while Answer must retain the definition; see [discussion](../../discussions/2026-09-25-05-word-context-card-content.md)
and [#512](https://github.com/vbalashi/2000nl/issues/512).

1. Characterize the ordinary reverse selection/action boundary and existing
   sentence sessions/presets. Specify transition behavior before changing it;
   preserve prior ordinary progress and historical sentence records. No automatic
   transfer of sentence grades into ordinary FSRS. Keep DB learning semantics
   in the existing scheduler/action owner, not in the UI.
2. Add context presentation over the ordinary reverse queue, with exact-meaning
   example eligibility and all existing filters/exclusions. Rotate examples
   within the selected meaning using minimal durable selection metadata; do not
   introduce a second queue or scheduling state. Freeze the selected node and
   fingerprint for an active question so reload/prefetch cannot change its answer.
3. Add small allowlisted presentation/hint metadata to the existing review action,
   preserving idempotency and atomic history/state writes. Reuse shared card/session
   templates. Face: translated example with a low-emphasis recall instruction;
   Answer: target word, exact original example and translation. POS hint may be
   used; do not guess cloze spans. Exact UI copy remains an implementation proposal.
4. Reuse translation readiness/cache and bounded next-card preparation. Audit
   in-flight deduplication, cancellation/stale responses and retry on aborted work;
   the previous smoke proves cache warming, not every race or transition latency.
5. Before release: DB tests prove one grade updates only the exact ordinary reverse
   state, duplicate delivery is harmless, direct/sibling states remain unchanged,
   and no per-example FSRS is created by this mode. Test exclusion of both directions,
   filter/preset round-trip, example rotation/reload, source edits/missing examples,
   unavailable translations, and preservation of old sessions/history. UI tests
   prove shared actions/stats and focused prompt/answer, hint metadata, no progress
   writes from preparation, and safe stale-response handling. Run relevant DB/UI
   checks, then authorized production smoke with measured start and transition time.

Future enhancement (outside MVP): validated target spans in Dutch, including
inflected/separable/multiword forms, and structured translation alignment for
highlighting the corresponding translated phrase. Reject invalid spans safely;
never use naive string replacement as reliable target alignment. This is recorded
as backlog scope, not an implemented feature or a release prerequisite.
