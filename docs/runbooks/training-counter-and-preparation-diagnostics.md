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
