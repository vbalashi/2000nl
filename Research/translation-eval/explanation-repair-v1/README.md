# Missing explanation recovery

Owner #655, PR #670. Accepted 2026-10-11: ship Luna dictionary completion cap
32768 and timeout180s from the previous full-card budget experiment. v8 primary
prompt bytes stay unchanged. Generic phrase timeout15s and GPT4.1 profile
budget2200/timeout15s remain. Explicit constructor timeout overrides win.

A completed JSON missing only idiom-explanation fields gets one semantic repair
request containing the full original request, previous response and exact missing
fields. Only the missing translations may be returned. Existing values are kept;
field order is normalized by ID, and the whole result passes the strict original
parser. Duplicate/unknown IDs, invalid field shapes/empty strings, missing other
roles, invalid JSON and malformed repair responses fail closed. Transport retries
(max3) remain separate; no semantic repair loop. Legacy rollback skips repair.
Diagnostics record missingCount, requested/ready/failed phase, operation,
request IDs, usage, timing and failure classes, without translation content.
Repair prompt bytes participate in nonlegacy cache identity.

## Saved-primary integration test

All25 frozen primary responses from fullcard-budget-v1 replayed through the
production translator.22 previously valid results require0 live calls;3 failures
are repaired with exactly3 live Luna6/high calls. All25 now pass, existing field
values preserved. All3 new explanations reviewed and accepted (primary-agent,
nonblind). New repair usage: input2703, completion364, including reasoning.
No fresh full-card generation and no DB/cache writes. This is recovery evidence,
not an independent25-card primary-generation quality claim.

First prototype repaired2 cases, but correctly refused the time card because its
retained example order differed. Final helper matches by authoritative field IDs
without changing values. Initial2 paid calls and24/25 prototype outcome remain
preserved in sibling655-explanation-repair-v1, not hidden from accounting.

Exact licensed sources, requests, responses, reviews and offline report remain
outside Git at /Users/khrustal/adhoc/2000nl-research-archives/655-explanation-repair-v2/.
The runner is apps/ui/scripts/translation-fullcard-volume/repair.ts.
Runtime change awaits PR review/release; this report does not claim deployment.
