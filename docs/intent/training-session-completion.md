# Shared training completion

Owner decision, 2026-10-02, issue #526: use the first displayed design, a quiet
reading summary with a serif title, saved active time beside the card count,
primary “Another 10 cards”, secondary “Modify training”, tertiary “Back to home”.
Use existing account palette, light/dark and reading tokens; no new palette.

Meaning, idiom and sentence controllers share presentation, while each retains
its existing server-owned queue and action boundary. Completion requires the
latched finite budget to be consumed. Early exhaustion, empty material, loading
and failures remain separate states.

“Another 10 cards” starts the next owned finite batch with the same current
recipe and name, changing only the requested size to 10. It does not reopen or
append consumed members. The scheduler still determines eligibility and may
return fewer cards or no cards. The count/time describe the completed batch,
not a fictitious cumulative extended queue. Changes to FSRS are out of scope.

Time is persisted active card attention, not wall-clock duration. Wait for the
bounded final receipt delivery before one owner-scoped summary read. Failed or
missing measurement delivery and unavailable reads omit time instead of showing
zero or a partial estimate. There is no summary polling loop.

Related follow-ups remain #527 animation preference, #528 front POS and #529
mixed idiom directions.
