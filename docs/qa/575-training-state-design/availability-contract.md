# Selected-recipe availability contract

Migration208 adds `read_training_recipe_availability_v1` with parameters:
`p_user_id`, `p_card_type_ids`, `p_list_id`, `p_list_type`,
`p_training_filter`, `p_exercise_family` (`meaning` or `idiom`). Contextual
Translation is the ordinary reverse card with `presentationMode=word-in-context`.
Independent sentence exercise availability is unsupported.

The response contains `dueToday`, `totalReviews`, `newCards`, `studyDay`,
`timezone`, `asOf`. Counts are direction-specific eligible cards, not distinct
headwords and not a truncated session preview. They ignore the recipe's session
size and New/Review selection so the three indicators can describe the full
selected material. The transient early-review flag is removed for this read.

`dueToday` includes overdue introduced FSRS-enabled cards and those due before
the end of the learner's current authoritative local study day (04:00 boundary).
`totalReviews` includes all introduced FSRS-enabled eligible cards regardless of
next-review date. `newCards` means **currently introducible eligible cards**, not
all future locked meanings or reverse cards. First-exposure/meaning-sequence
rules, rendering guards, lexical/activity/material filters and exclusions remain
part of ordinary eligibility. Unanswered enabled states are not introduced
reviews. Known, hidden, frozen, excluded and unavailable-source cards do not
inflate availability.

Ordinary aggregation extracts the exact installed scheduler's unordered
eligibility CTE prefix before candidate ranking, session rhythm or truncation.
The migration and postflight compare it against that exact scheduler prefix;
future scheduler eligibility changes must update the projection in the same
migration. The endpoint does not call the full candidate/session planner. Idiom
aggregation reuses the authoritative source-node relation and reads existing
directional target/state rows, never creating targets.

Owner identity is checked in the RPC and derived by the API server. A foreign
user's list is rejected; explicitly selected dictionaries must remain accessible.
Only authenticated receives the public RPC execute grant; the unordered helper
remains private. The endpoint succeeds inside `BEGIN READ ONLY`.

Validation: **346 tests passed in 37 files** in a disposable database, including
11 new availability tests. Both full and read-only postflight208 chains passed
in a separate disposable database. Deployment contract unit tests: 19 passed.
No production writes or deployment performed by this subtask. Canonical local data contains 18,163 source bindings and 40,403 active content
nodes. The original projection took a warm median of 5,946 ms. Its underestimated
introduction relation caused a nested loop with 285,314,064 rejected comparisons.
Only the private count helper now scopes `enable_nestloop=off` and `jit=off`; the
caller settings and ordinary scheduler stay unchanged. A regression test and
postflight probe verify the scope. Exact eligibility predicates are preserved.

After this change, actual RPC warm medians on the same real provenance data are
265.50 ms for direct, 371.88 ms for both directions, 494.99 ms for nouns and
382.81 ms for verbs. Direct counts remain exactly 0 due / 0 reviews / 13,867 new.
Contextual Translation measured 319.03 ms and idioms 239.21 ms, but the empty
history principal had zero eligible cards in these cases, so these measurements
do not establish nonempty-family performance. These are database timings, not
end-to-end UI latency. Raw evidence is in
`performance-real-provenance-analyze.json` and
`performance-real-provenance-optimized-results.json` alongside this document.

Migration SHA-256:
`22bba96158e55b4f6c2948bf0bd245bd86813e7bf84f9e31aaa5f8aa14518f38`.
