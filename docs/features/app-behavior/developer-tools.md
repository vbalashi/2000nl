# App Behavior: Developer Tools

## URL Testing Parameters
**Added:** 2026-01-14
**User Stories:** US-027.1 through US-027.3

Enable direct card access and layout control for testing, debugging, and automation.

**Usage:**
```text
/?wordId=fiets&devMode=true
/?wordId=123&layout=w2d&devMode=true
/?wordId=auto&layout=d2w&devMode=true
```

**Parameters:**
- `wordId`: Word ID (numeric) or headword
- `layout`: `w2d` or `d2w`
- `devMode=true`: required to enable URL params

**Implementation:**
- Hook: `useCardParams()` in `apps/ui/lib/cardParams.ts`
- Helper: `parseCardParams()` in `apps/ui/lib/cardParams.ts`
- Word loading: `fetchTrainingWordByLookup()` exported by `apps/ui/lib/trainingService.ts`; implemented in `apps/ui/lib/training/dictionaryService.ts`
- Integration: `forcedNextWordIdRef` in `TrainingScreen.tsx`
- Tests: `apps/ui/tests/cardParams.test.ts`

## SRS History Analysis Script
**Added:** 2026-01-14
**User Story:** US-029

Analyze user learning history, intervals, and review patterns.

**Usage:**
```bash
./db/scripts/srs_history.sh <user_id>
./db/scripts/srs_history.sh <user_id> <word_id>
```

**Output:**
- Chronological review history
- Interval values before and after each review
- User response grades
- Repetition anomaly signal

**Database queries:**
- `user_review_log`
- `word_entries.headword`
- `word_forms.form`

**Use cases:**
- Debug queue anomalies
- Inspect FSRS interval progression
- Analyze repeated-card complaints

## Debugging Guidance

- Use [technical-model.md](./technical-model.md) for table and RPC context.
- Use [core.md](./core.md) when debugging user-visible training behavior.
- Use [docs/runbooks/production-login.md](../../runbooks/production-login.md) for production auth workflows.

## Next-card Selection Latency Benchmark

**Added:** 2026-08-24
**Issue:** #228

`db/scripts/next_card_selection_latency_benchmark.mjs` compares the retired raw
JSON exclusion predicate, the indexed anti-join, and the complete
`get_next_card` scheduler on a disposable loopback database with at least
18,000 entries. It requires exactly the isolated `test@2000nl.test` fixture
identity and rejects database names that do not contain `issue228`.

The enforced rollout budget is a plan-cold first call at most 2,000 ms, warm
p95 at most 1,000 ms, and warm maximum at most 2,000 ms over 30 samples. This
local benchmark does not flush PostgreSQL shared buffers or the OS cache, so it
supports—but does not replace—bounded production cold/warm rollout evidence.

## Scheduler Dictionary-access Benchmark

**Added:** 2026-08-24
**Issue:** #232

`db/scripts/scheduler_dictionary_access_benchmark.mjs` builds an exact
18,184-entry, non-null dictionary fixture with realistic system, ownership,
public, entitlement, and denial outcomes. It measures both the authoritative
session plan and repeated selector and uses Postgres function statistics to
reject a scheduler that calls `can_access_dictionary` per entry.

The loopback/database-name and `test@2000nl.test` guards prevent accidental
production use. The fixed first/warm budgets match the next-card rollout gate;
production cold/warm reads remain mandatory after integration.
