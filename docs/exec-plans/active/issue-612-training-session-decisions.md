# Issue 612: Training session decisions

## Slice

Extract only the pure decisions already made by TrainingScreen for saved-session preflight, resume snapshot classification, and server plan-revision authority. TrainingScreen remains the sole owner and executor of storage, network, React state, generation fences, replan coalescing, and queue effects. Preserve operation ordering, accepted counts, error codes, offline behavior, and polling.

## Characterization and validation

Before extraction, retain/add TrainingScreen integration characterization that a saved session does not fetch its server snapshot until its saved language and corresponding list catalogue are hydrated, and that a same-run replan preserves server-confirmed completed actions/card keys. Add decision-table unit coverage for all pure outcomes. Validate the decision table, TrainingScreen, sentence and idiom session tests, UI typecheck, and lint.

## Exclusions

No DB/API contract, user-visible semantics, timing budgets, or unrelated Training/Library/telemetry changes.
