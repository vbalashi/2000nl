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

## Regression checks

Run the targeted TrainingSenseCardV2Session, useWordContextPrompt, wordContextPrompt, sentenceExerciseLoader, TrainingSentenceSession, LibrarySenseCardGroup and TrainingSessionV2Layout tests. The tests cover late readiness without a click, retry bounds, cancellation, failure classification, shared New/Learning chrome, and the approved canvas when a terminal session outlives the viewport wrapper.

Issue: https://github.com/vbalashi/2000nl/issues/588. Database diagnosis is read-only; no scheduler or schema change is needed for these fixes. Production visual confirmation remains a release check.
