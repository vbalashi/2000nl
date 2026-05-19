# App Behavior: Technical Model

## Data Model

### Key Tables

**`user_card_status`**
- Tracks user progress per `user_id + entry_id + card_type_id`
- FSRS fields: `fsrs_stability`, `fsrs_difficulty`, `fsrs_reps`, `fsrs_lapses`, `fsrs_last_grade`, `fsrs_last_interval`
- Scheduling fields: `next_review_at`, `last_seen_at`, `last_reviewed_at`, `in_learning`, `learning_due_at`
- `hidden`: flag for excluded words
- `frozen_until`: temporary exclusion until a later review time
- Interaction counters: `click_count`, `seen_count`, `success_count`

**`user_review_log`**
- Audit trail of all review events
- `grade`: 1 (again) | 2 (hard) | 3 (good) | 4 (easy)
- `interval_after`: next review interval after the action
- `review_type`: `handle_card_review` writes `new` or `review` for graded reviews. Queue sources such as `learning` and `practice` are exposed as `stats.source`, not as review-log types.
- `turn_id`: optional client-generated UUID used to prevent accidental double-submit reviews

**`word_entries`**
- Dutch words with headword and definitions

**`word_forms`**
- Word variations and conjugations

**`word_lists` / `word_list_items`**
- Curated lists such as `vandale-all` and `nt2-2000`

**`user_settings`**
- Training preferences: active scenario, enabled modes, active list, card filter, new/review ratio, translation language, theme, sidebar pinning, audio quality, subscription tier

**`word_entry_translations` / `user_word_notes`**
- Shared translation overlays per word/language and per-user notes

## Codebase Structure

### UI Components
- `apps/ui/components/training/TrainingScreen.tsx`
- `apps/ui/components/training/TrainingCard.tsx`
- `apps/ui/components/training/FirstTimeButtonGroup.tsx`
- `apps/ui/components/training/SidebarCard.tsx`
- `apps/ui/components/training/Sidebar.tsx`
- `apps/ui/components/training/SettingsModal.tsx`
- `apps/ui/components/Tooltip.tsx`

### Types
- `apps/ui/lib/types.ts`
- `TrainingWord` contains `isFirstEncounter`, `mode`, and related UI state

### Service Logic
- `apps/ui/lib/trainingService.ts` compatibility barrel
- `apps/ui/lib/training/dictionaryService.ts`
- `apps/ui/lib/training/selectionService.ts`
- `apps/ui/lib/training/reviewService.ts`
- `apps/ui/lib/training/listService.ts`
- `apps/ui/lib/training/preferencesService.ts`
- `apps/ui/lib/training/statsHistoryService.ts`
- `fetchNextTrainingWord()`
- `fetchNextTrainingWordByScenario()`
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

**`get_next_card(...)`**
- Includes `stats.source`
- Selects among explicit card modes supplied by the caller
- Accepts list scope, card filter, queue turn, and exclusions. Fresh migrations do not expose a separate scenario overload; resolve scenarios through `get_training_scenarios()` / `get_scenario_stats()` and pass the resulting modes.

**`handle_card_review(p_user_id, p_entry_id, p_card_type_id, p_result, p_turn_id?)`**
- Records the user action
- Updates FSRS fields
- Calculates next review timestamp
- Inserts review/event rows
- Treats duplicate non-null `p_turn_id` submissions as no-ops

**`get_training_stats(...)`, `get_scenario_stats(...)`, `get_training_scenarios()`**
- Feed footer counters, settings/statistics views, and scenario-level progress

### Queue Mechanism

The training screen keeps lightweight session state:
- `queueTurn` and `reviewCounter` implement the new/review alternation requested by user preferences.
- `reviewedInSessionRef` excludes already-reviewed cards while fetching the next card.
- `currentTurnIdRef` stores the UUID sent to `handle_card_review` for duplicate-submit protection.
- URL testing uses `useCardParams()` plus `fetchTrainingWordByLookup()` for direct word loads, rather than a separate backend test endpoint.

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
- Logic tests: `npm test`
- Lint: `npm run lint`
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
