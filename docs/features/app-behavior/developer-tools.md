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
- Word loading: `fetchTrainingWordByLookup()` in `apps/ui/lib/trainingService.ts`
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
