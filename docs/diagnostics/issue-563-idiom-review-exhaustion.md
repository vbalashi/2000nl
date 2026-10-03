# Idiom review exhaustion (#563)

Reported on 2026-10-03, production0.18.1123 / main4f24fb32 / DB200.
Owner completed three idioms in a five-card session, then restarted and saw
“No explained idioms match this selection.” The empty state differed from the
shared completion presentation.

## Read-only production evidence

The two owned sessions both selected `idiom:direct`, `card_filter=review`,
requested five cards, and retained the same all-date material scope. The first
planned three review members; the second planned zero. The saved `Idiooms` recipe
also has `cardFilter=review`.

The exact source-node relation for the second saved session contains314 eligible
idioms:311 unstarted, zero due now, three scheduled later. The earliest next due
was2026-10-03T11:55:06.61934Z (13:55 Amsterdam). This is a point-in-time diagnostic,
not an enduring promise. No candidate-materializing/start/review RPC was called.
All diagnostics used read-only SELECTs/transactions; no owner progress changed.

The existing stats RPC reports total314 / started3 / reviewsDone3 / reviewsDue3.
Its day-based due counter is not the exact current-time candidate count; do not
use it to claim another review is immediately available.

## Findings

1. The scheduler correctly respected review-only selection. New idioms are
   available but intentionally excluded by that saved recipe. A requested size
   is a maximum; it cannot guarantee enough currently eligible review members.
2. The empty-state copy falsely suggests missing explained idioms instead of
   no cards eligible under the current study policy.
3. Idiom zero-plan/exhausted rendering still uses `TrainingSessionState`, while
   positive completed runs use `TrainingCompletion`. This bypass explains the
   inconsistent typography/action placement.
4. Idiom chrome receives hardcoded `both` instead of the saved filter. The
   filter is restored from the owned resume record and start draft in
   `TrainingScreen`, so it can be passed without a new DB contract.

## Correction boundary

Use shared terminal presentation and theme tokens. Explain review-only empty
states and offer Modify training / Back to home. Do not silently include new
cards or launch the identical empty recipe via Another10. A positive completed
count followed by exhaustion must retain its actual count and completion screen.
Keep scheduler, FSRS, material scope, and independent directions unchanged.

Verify zero-plan review-only, unknown-filter fallback, partial exhaustion after
accepted answers, completed session, callbacks and pending action fences. Browser
QA should compare completed and empty variants in light/dark presentations.

## Verification

Two exact regressions failed before the fix (empty-plan presentation and partial
consumed exhaustion). After correction,29 focused TrainingIdiomSession / shared
completion tests pass, as do typecheck and focused lint. Both review-only zero-plan
and generic unavailable-member exhaustion are covered; the latter does not falsely
assert there were no due cards. English/Dutch/Russian empty copy and pending-action
fences are covered. Existing positive completion actions remain unchanged.

Actual shared component browser captures at610×900 compare empty/completed in
light/dark: identical36px heading scale and panel colors; no horizontal overflow.
See `docs/qa/563-idiom-empty/browser.json` and the four PNGs. These captures use an
isolated temporary preview, not a production session or full session transport.
The temporary route and server were removed. UI commit:b3db0cee.
