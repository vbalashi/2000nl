# Training counters and pending context translations

Session completion counts accepted actions in the selected run. Statistics activity uses a different read model (`get_training_activity_days_v1`, migration 188):

- New exercises: distinct meaning-and-direction introductions per study day, combining `start-learning` and graded reviews recorded as `new`.
- Reviews: each graded review recorded as `review`, including repeated answers for one card.
- Example/idiom exercise activity: the first exercise review is new; subsequent exercise reviews are reviews.
- Study days start at 04:00 in the account time zone. Activity spans training in the selected language, rather than only the current session.

A session with three Learn actions, eight first graded answers and four later graded answers therefore has 15 completed actions, 11 new exercises and four reviews. The visible grade (Again/Good/Easy) alone does not establish whether an answer is new or review. Use the stored `review_type` to explain it.

## Pending context preparation

An ordinary reverse exercise can show a translated example without becoming a content-bound sentence exercise. Its frozen example is stored on `training_session_members.context_content_node_id`. Inspect ordinary members for this mode, rather than only `training_session_exercise_members`.

The translation coordinator may return pending while another request produces the artifact. A client that reads once will keep showing pending even after the artifact becomes ready. `useWordContextPrompt` rechecks the same member at two-second intervals, with at most ten rechecks, and cancels when the card changes or unmounts. Longer waits retain manual retry. This preparation never records grades or consumes members.

A translation provider result of failed must remain unavailable; it must not be converted into pending. Preserve the distinction in both normal and speculative sentence loaders.

Preparation failures and transport errors receive at most two automatic retries,
after two and four seconds. Missing/revoked source identity is not retried. The
same member remains selected; manual retry starts a fresh bounded attempt and
leaving the card cancels timers and ignores late responses.

## Ready article with an untranslated example (#672)

The 2026-10-11 incident stopped an ordinary reverse run after six accepted
answers. Its next member was `oog`, frozen to
`raw.meanings[0].examples[0]` (`mijn dochters hebben blauwe ogen`). The stored
Russian overlay was ready but contained no standalone examples. Its 24 requested
content fields were the definition, nine idiom/explanation pairs, and five idiom
examples. The ordinary example had been dropped before provider invocation.
The entry's ready translation suppressed its request-translation capability,
so manual retry returned unavailable before invoking translation. Automatic
rechecks previously applied only to pending results, not failures.

Standalone meaning examples now precede optional idiom examples and lexical
relations in the bounded request. Definition, usage pattern and idiom meaning
constraints retain priority; idiom-only entries retain their existing ordering.
The ordinary pipeline policy is `dictionary_meaning_examples_first_v2`; old
ordinary overlays fail freshness checks in both projection and coordinator and
are regenerated lazily through the existing request capability. No scheduler,
member identity, grade or progress repair is involved. This policy revision
also makes previously ready ordinary translations regenerate on next demand;
there is no bulk provider job.

This fixes budget starvation for the reported source, rather than claiming
unlimited article coverage: existing per-item, token, character and item-count
limits still apply. Any future oversized selected example needs an explicit
bounded targeted-translation contract, not endless retries or silently choosing
another example.

### Relationship to the preceding generator release (#670)

Production health confirmed commit `872d2e8606f9118f8bdad6759721727bb4aad476`
(#670). The affected overlay was updated at 2026-10-11 09:18:42 UTC with prompt
fingerprint `129be0a92c4890f99ea96b8c5c48335d9e39fafa130597d0b96c2f92d0ef2035`,
matching the current Luna6 profile including 32768 completion tokens, high
reasoning, and the explanation-repair prompt. This was not merely an old
artifact waiting for the new generator to invalidate it.

The increased completion budget and 180-second provider timeout do not change
request selection limits: 24 content items, 600 characters per item, 6000 content
characters, and 2500 estimated content tokens. The #670 repair compares output
against `request.content` and repairs missing idiom explanations only. Replaying
the deployed builder on the exact source still omitted `example:0`; a synthetic
complete response for its selected 24 fields passed the strict parser and
produced no repair plan. No paid provider call was needed to establish this.

The prior full-card experiment explicitly collected source-versus-sent coverage
and omitted-field metrics, but its runtime delivery/repair checks validated the
bounded selected request, not completeness of every source field or readiness
of the frozen training member. Successful long-response generation therefore
did not establish end-to-end training readiness. Provider transport retry,
explanation repair, cache invalidation and UI preparation retry are separate
mechanisms; none could introduce an example absent from the selected request.

### Expanded coverage and live audit: draft hold

The reordering is a partial fix, not a complete-source contract. `oog` contains
29 content fields: one definition, nine idioms, nine explanations, and ten
examples (one standalone and nine idiom examples), plus its headword. Both old
and reordered requests contain 24 content fields and five examples; reordering
replaces one idiom example with the standalone example. It does not translate
all source examples. The complete content is only 1193 characters and an
estimated 1881 content tokens including field/role metadata; the 24-item ceiling,
not the other current content budgets, excludes the remaining examples here.

A read-only census replayed the revised builder for 12280 stored entries with
13374 standalone examples. One standalone example still failed exact coverage:
the active `hand` entry with 26 idioms. The census includes stored entries rather
than claiming a filtered active-training corpus. This is a known remaining
counterexample to resolving starvation only by reordering.

Live Luna6/high/32768-token testing performed one revised bounded request and
three experimental complete-source requests (the latter bypassed the builder's
24-item selection only; no production setting or DB/cache was changed). All
four completed with one provider call each and no explanation repair. The
complete requests returned all 29 fields in 37.1, 50.4 and 42.5 seconds. Their
observed completion usage was 5387, 8145 and 6422 tokens. All ten examples were
present in all three. Agent assessment found no major meaning/participant/
negation errors; minor variation included more literal versus explanatory
idiom wording and capitalization. This is a three-run check of one article,
not a blinded linguistic evaluation or reliability guarantee for the corpus.
Raw dictionary inputs/results remain in ignored `tmp/oog-live-audit/` in the
issue worktree, which must be retained as evidence until preserved explicitly.

Additional execution mismatches remain: the browser translation client defaults
to 12 seconds, whereas the server provider allows 180 seconds per call; the
coordinator treats same-fingerprint pending work as fresh for only 15 seconds.
Successful observed generations exceeded both shorter windows. This proves
timeout configuration is inconsistent; it does not establish a specific
duplicate race in the reported production session. The owner-guarded cache
write protects against late overwrites but does not itself prevent duplicate
generation or report whether the final write matched a claim.

PR #673 is held as a draft. Before claiming general recovery, implement explicit
complete or exact-target coverage with bounded batches for large articles,
validate the frozen example's readiness independently from entry readiness,
align browser polling/execution and pending ownership lifetimes, and test
concurrent owners, abandoned claims, slow success, missing non-explanation
fields, source/policy changes and retry exhaustion. Do not release reordering
as coverage of all known scenarios.

Regression checks include an idiom-heavy request that previously omitted the
ordinary example, old-ready-overlay invalidation, automatic failure recovery,
retry bounds, and manual retry reset. The exact production `oog` source was
also replayed through the request builder and included the frozen example within
24 items. Production diagnosis used read-only SQL; the account's session and
progress were left intact. Deployment and an actual post-release resume remain
separate verification steps.

## Regression checks

Run the targeted TrainingSenseCardV2Session, useWordContextPrompt, wordContextPrompt, sentenceExerciseLoader, TrainingSentenceSession, LibrarySenseCardGroup and TrainingSessionV2Layout tests. The tests cover late readiness without a click, retry bounds, cancellation, failure classification, shared New/Learning chrome, and the approved canvas when a terminal session outlives the viewport wrapper.

Issue: https://github.com/vbalashi/2000nl/issues/588. Database diagnosis is read-only; no scheduler or schema change is needed for these fixes. Production visual confirmation remains a release check.
