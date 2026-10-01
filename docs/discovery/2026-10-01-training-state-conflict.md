# Repeated Learn rejects an obsolete card revision

Production 0.18.1063; isolated QA account; desktop Chromium; curated collection, word-to-definition only, both new/review, ratio 2, session size 10. Dwell alternates 100/500 ms. Three runs attempted 13, 30 and 32 actions, stopping on the first failed mutation. Two failures occurred (2/75 attempts in this collection; not an estimated population failure rate). All QA sessions were revoked.

## Confirmed evidence

In `conflict-state-1790884937123.jsonl`, action 21 successfully submitted `start-learning` for entry alias `7774f9b8cd443fbd`, revision alias `86ed2df8017823df`. Server accepted it and returned scheduler phase `learning`, revision alias `c334c763b0673b65`. After completing that session and starting another through Adjust, action 32 submitted `start-learning` for the same entry/type with the old revision `86ed2df8017823df`. Server returned HTTP 409, error `state_conflict`. Identifiers are irreversible shortened hashes, not user IDs or source text.

The first run also rejected Learn on action 13: HTTP 409 in 215 ms, failed mutation 224 ms, server operation 165 ms. That capture incorrectly expected an object error; it did not record the string error code. The second capture fixed the parser, but 30 actions passed. The final capture reproduces the specific enum. The harness stops on failed mutation rather than reporting a misleading 30-second transition timeout.

## Boundary and next test

Confirmed immediate cause: UI submitted a stale state revision for a card that this very run had already changed. The server's optimistic concurrency rejection is correct. This does not justify removing revision validation or silently replaying a grade. The retry/reload after rejection was not fully observed: the browser closed shortly after recording failure.

Ranked hypotheses: (1) a lookup/cache entry survives accepted mutation and session restart; (2) in-flight lookup publishes pre-mutation state after invalidation; (3) session selector and presentation projection disagree on the current phase. Additional evidence needed: record entry-scoped lookup request start/finish, cache write/invalidation and accepted response for the repeated card. The current lookup snapshots retain phase/revision but omit entry identity, so they cannot distinguish (1) from (2).

The deployed same-meaning revalidation in `usePreparedNextTrainingTurn` applies to the immediately prepared candidate when its entry equals the accepted entry. It does not by itself prove that every older cached entry across subsequent sessions is refreshed. Future fix belongs in mutation-driven state/cache ownership, with a deterministic regression for Learn, session completion, restart and repeated entry. No runtime fix was made in this collection.
