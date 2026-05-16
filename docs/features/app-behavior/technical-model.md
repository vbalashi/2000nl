# App Behavior: Technical Model

## Data Model

### Key Tables

**`user_word_status`**
- Tracks user progress per word
- FSRS fields: `stability`, `difficulty`, `last_interval`
- `source`: `new`, `review`, or `practice`
- `hidden`: flag for excluded words
- `last_review`: timestamp of most recent review
- `review_count`: total number of reviews

**`user_review_log`**
- Audit trail of all review events
- `grade`: 1 (again) | 2 (hard) | 3 (good) | 4 (easy)
- `interval_after`: next review interval after the action
- `review_type`: `review`, `practice`, or `click`

**`word_entries`**
- Dutch words with headword and definitions

**`word_forms`**
- Word variations and conjugations

## Codebase Structure

### UI Components
- `apps/ui/components/training/TrainingScreen.tsx`
- `apps/ui/components/training/TrainingCard.tsx`
- `apps/ui/components/training/FirstTimeButtonGroup.tsx`
- `apps/ui/components/training/ActionButtons.tsx`
- `apps/ui/components/training/SidebarCard.tsx`
- `apps/ui/components/Tooltip.tsx`

### Types
- `apps/ui/lib/types.ts`
- `TrainingWord` contains `isFirstEncounter`, `mode`, and related UI state

### Service Logic
- `apps/ui/lib/trainingService.ts`
- `fetchNextWord()`
- `recordReview()`
- `fetchTrainingWordByLookup()`

### Utilities
- `apps/ui/lib/wordUtils.ts`
- `apps/ui/lib/cardParams.ts`

### Database Scripts
- `db/scripts/psql_supabase.sh`
- `db/scripts/srs_history.sh`

### Testing
- `apps/ui/tests/`
- `npx tsc --noEmit`
- `npx vitest run`

## Backend Integration

### RPC Functions (Supabase)

**`get_next_training_word_with_stats(userId, wordId?)`**
- Returns the next card in the queue
- Includes `stats.source`
- Selects card mode by scenario
- Supports forced card loads for URL testing

**`record_training_review(userId, wordId, grade, ...)`**
- Records the user action
- Updates FSRS fields
- Calculates next review timestamp
- Returns updated card state

### Queue Mechanism

Frontend uses `forcedNextWordIdRef` to bypass the normal queue:
- Set `forcedNextWordIdRef.current = wordId`
- The next `fetchNextWord()` loads that word
- Used by URL testing params and targeted manual testing

## Development Patterns

### Adding New Features
1. Read [core.md](./core.md) and [features.md](./features.md) first.
2. Check whether a similar component or utility already exists.
3. Add or update types in `types.ts` if new data structures appear.
4. Use the shared `Tooltip` component instead of `title` attributes.
5. Include typecheck and relevant tests in acceptance criteria.
6. Update the appropriate behavior doc after implementation.

### Testing
- Type safety: `npx tsc --noEmit`
- Logic tests: `npx vitest run`
- Browser verification: current browser automation flow or manual reproduction
- Targeted card testing: `/?wordId=test&devMode=true`

### Database Access
- Use `db/scripts/psql_supabase.sh` for manual queries
- Set `SUPABASE_DB_URL` or `DATABASE_URL`
- Inspect `user_review_log` when debugging review history

## Usage For Agents

### Before planning work
1. Start with [docs/features/app-behavior.md](../app-behavior.md).
2. Open only the topic file relevant to the task.
3. Cross-check file ownership and runtime boundaries in [ARCHITECTURE.md](../../../ARCHITECTURE.md).

### After completing a story
1. Update the smallest relevant topic doc.
2. Keep entries concise and factual.
3. Include file locations only when they materially help future debugging.
