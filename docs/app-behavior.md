# 2000nl App Behavior Reference

**Last updated:** 2026-01-26
**Purpose:** Living documentation of app features, behavior, and developer tools. Read this FIRST before code exploration to understand expected behavior and existing functionality.

---

## Overview

2000nl is a Dutch vocabulary learning web app using **SRS (Spaced Repetition System)** with flashcard-style training. The backend uses the **FSRS algorithm** (Free Spaced Repetition Scheduler) to optimize learning intervals based on user performance.

**Tech stack:**
- Next.js (App Router, single-page app)
- TypeScript
- Supabase (PostgreSQL database)
- FSRS algorithm for spaced repetition

---

## Core Concepts

### Training Flow

1. **Card Queue**: Backend RPC (`get_next_training_word_with_stats`) manages card selection and queue
2. **Card Presentation**: User sees either:
   - **Word → Definition (W→D)**: Dutch word shown, user recalls meaning
   - **Definition → Word (D→W)**: Meaning shown, user recalls Dutch word
3. **User Actions**:
   - `again` (fail): Didn't remember, restart learning
   - `hard`: Remembered with difficulty
   - `good`: Remembered correctly
   - `easy`: Remembered easily
   - `hide`: Exclude word from queue (user already knows it)
4. **Interval Calculation**: FSRS algorithm adjusts next review interval based on action

### Word States

- **First Encounter** (`source="new"`): Word never seen before
  - Shows **FirstTimeButtonGroup** (2 buttons)
  - Always displays in **W→D direction**
  - Actions: "Start learning" (fail) or "I know it already" (hide)
- **Learning** (`source="review"`): Active in queue with FSRS intervals
  - Shows standard **4-button interface** (again/hard/good/easy)
  - Direction varies based on backend scenario selection
- **Hidden**: User marked "I know it already"
  - Excluded from training queue
  - Stored with `hidden=true` or equivalent flag

### Card Components

- **Main Card**: Large central card showing current word/definition
- **Recent Opgezocht Sidebar**: Right sidebar showing recently looked-up words (clicked translations)
- **Action Buttons**:
  - FirstTimeButtonGroup (first encounter): 2 buttons
  - Standard ActionButtons (learning/review): 4 buttons

---

## Features

### Version Display in Settings
**Added:** 2026-01-26 (Sprint: Production Readiness & Polish)
**User Story:** US-078.1

**Behavior:**
The Settings page now shows the app version from `package.json`, the build commit hash, and the build timestamp in a single line (e.g., "Version 1.2.3 (build abc123ef, 2026-01-26 14:30)"). A matching version string also appears in the footer/about area for quick reference without opening Settings.

### Health Monitoring Endpoint
**Added:** 2026-01-26 (Sprint: Production Readiness & Polish)
**User Story:** US-078.2

**Behavior:**
The app now exposes a public `/api/health` endpoint for monitoring and uptime checks. It returns JSON with `version`, `uptime`, `status`, `timestamp`, and `commit`, and responds with HTTP 200 when the service is healthy. This endpoint is unauthenticated so external monitors can poll it without a session.

### Telegram Deployment Notifications
**Added:** 2026-01-26 (Sprint: Production Readiness & Polish)
**User Story:** US-078.3

**Behavior:**
Deployments now send Telegram notifications on start, success, and failure to the configured chat. Messages include the version, commit hash, server name, and (on success) the deployment duration, with failures also including error details. This is wired through the deployment script using a bot token stored in the environment.

### PWA Install Support (Icon + Fullscreen)
**Added:** 2026-01-23 (Sprint: PWA + Polish)
**User Story:** US-032

**Behavior:**
The app now ships a web app manifest and platform meta tags so it can be installed to the home screen and launch in standalone fullscreen mode without browser chrome. A full icon set is provided for Android and iOS, and installation works via Add to Home Screen on iOS Safari and the install prompt on Chromium browsers. Offline mode is intentionally unsupported; when the device is offline, a banner appears with the message "You're offline. Please connect to continue".

### Desktop Card Width Expansion (Readability)
**Added:** 2026-01-23 (Sprint: PWA + Polish)
**User Story:** US-045

**Behavior:**
On desktop, the training card column now expands to `max-w-3xl`, increasing definition line length for better readability while keeping the sidebar balanced. This removes the previous fixed-width feel and avoids horizontal scrolling on standard desktop widths. Changes live in `apps/ui/components/training/TrainingScreen.tsx` (main column width) and `apps/ui/components/training/TrainingCard.tsx` (inner content width).

### Color Accessibility Improvements (WCAG AA)
**Added:** 2026-01-23 (Sprint: PWA + Polish)
**User Story:** US-052

**Behavior:**
The Tailwind color palette and component color pairings were adjusted to meet WCAG AA contrast requirements for normal and large text across the UI. Buttons, badges, text, and background combinations now maintain accessible contrast while preserving the existing brand hue and feel. Updated usage guidance lives in `apps/ui/docs/accessibility-colors.md`.

### Cross-Reference-Only Word Filtering
**Added:** 2026-01-14 (Sprint: Data Quality & Mobile UX)
**User Story:** US-020

**Behavior:**
Words that only point to another entry (cross_reference set with an empty meanings array) are filtered out before entering the learning queue. This prevents placeholder entries like "bereid (werkwoord)" from appearing in training sessions. Filtering is applied in the training word selection pipeline so these cross-reference-only items never reach the UI.

### Mobile Swipe Gestures for Training Cards
**Added:** 2026-01-14 (Sprint: Data Quality & Mobile UX)
**User Story:** US-031

**Behavior:**
On mobile, users can swipe left for "opniew" (again) and right for "goed" (correct), with the card following the finger and snapping back on canceled swipes. The swipe must pass a 30-40% width threshold to commit the action. Mobile action buttons are arranged in two rows (opniew/goed, then moeilijk/makkelijk) while the desktop button layout remains unchanged.

### First-Time Learning UX
**Added:** 2026-01-14 (Sprint: Learning UX & Testing Tools)
**User Stories:** US-030.1 through US-030.5

**Behavior:**
- When a word appears for the first time (`isFirstEncounter: true`), the UI changes:
  - Card always shows **W→D direction** (Dutch word first)
  - **Two-button interface** replaces standard 4-button group
    - "Begin met leren" (Start learning) → Calls `handleAction("fail")`, adds to learning queue
    - "Ik ken dit al" (I know it already) → Calls `handleAction("hide")`, hides from queue
- Subsequent reviews show standard 4-button interface with variable card direction

**Implementation:**
- Detection: `TrainingWord.isFirstEncounter` derived from `stats.source === "new"` in `apps/ui/lib/trainingService.ts`
- Component: `apps/ui/components/training/FirstTimeButtonGroup.tsx`
- Rendering: Conditional in `apps/ui/components/training/TrainingScreen.tsx`
- Direction override: In `apps/ui/lib/trainingService.ts` training word mapping

---

### URL Testing Parameters (Developer Tool)
**Added:** 2026-01-14 (Sprint: Learning UX & Testing Tools)
**User Stories:** US-027.1 through US-027.3

**Purpose:** Enable direct card access and layout control for testing, debugging, and automation.

**Usage:**
```
/?wordId=fiets&devMode=true           # Load specific word by ID or headword
/?wordId=123&layout=w2d&devMode=true  # Force W→D direction
/?wordId=auto&layout=d2w&devMode=true # Force D→W direction
```

**Parameters:**
- `wordId`: Word ID (numeric) or headword (text like "fiets")
- `layout`: Card direction
  - `w2d` → Word-to-Definition (Dutch first)
  - `d2w` → Definition-to-Word (meaning first)
- `devMode=true`: **Required** to enable URL params (security gate)

**Security:**
- Only works when `devMode=true` flag is in URL OR `NEXT_PUBLIC_DEV_MODE` env var is set
- Production users cannot discover or use this feature without explicit flag
- Dev console logs when dev mode is active

**Implementation:**
- Hook: `useCardParams()` in `apps/ui/lib/cardParams.ts`
- Helper: `parseCardParams()` for URL parsing
- Word loading: `fetchTrainingWordByLookup()` in `apps/ui/lib/trainingService.ts`
- Integration: `forcedNextWordIdRef` in `TrainingScreen.tsx`
- Tests: `apps/ui/tests/cardParams.test.ts`

**Testing synergy:** Use URL params to test first-time buttons: `/?wordId=nieuwe-woord&devMode=true`

---

### SRS History Analysis Script (Developer Tool)
**Added:** 2026-01-14 (Sprint: Learning UX & Testing Tools)
**User Story:** US-029

**Purpose:** Debug SRS queue issues by analyzing user learning history, intervals, and review patterns.

**Usage:**
```bash
# Analyze all reviews for a user
./db/scripts/srs_history.sh <user_id>

# Analyze specific word for a user
./db/scripts/srs_history.sh <user_id> <word_id>
```

**Output:**
- Chronological history of card appearances
- Interval values before and after each review
- User response grades (1=again, 2=hard, 3=good, 4=easy)
- Anomaly detection flag for repeated cards despite good/easy answers

**Database queries:**
- `user_review_log`: Review history with `grade` and `interval_after` fields
- `word_entries.headword` or `word_forms.form`: Word text resolution
- Filters: `review_type` excludes "click" events (sidebar lookups)

**Use cases:**
- Debug issue 2000NL-002 (words repeating after "goed" answer)
- Analyze FSRS interval progression
- Identify anomalies in learning patterns

**Implementation:** `db/scripts/srs_history.sh`

---

### Unknown Word Tap Feedback
**Added:** 2026-01-13 (Sprint: UI Polish)
**User Story:** US-001
**Fixes:** 2000NL-001

**Behavior:**
- When user taps a word not in dictionary (on main card), the sidebar shows feedback
- Unknown words appear in "recent opgezocht" with special `not-found-` prefixed ID
- SidebarCard displays "geen definitie gevonden" (no definition found) message
- Deduplication prevents duplicate not-found entries

**Why:** Previously, tapping unknown words gave no feedback, causing confusion (especially on mobile)

**Implementation:**
- `apps/ui/components/training/TrainingScreen.tsx` (word click handler)
- `apps/ui/components/training/SidebarCard.tsx` (not-found message display)

---

### Translation Overlay Fix (Mobile)
**Added:** 2026-01-13 (Sprint: UI Polish)
**User Story:** US-002
**Fixes:** 2000NL-003

**Behavior:**
- Inline translations (hover/tap popups) now display on one line with ellipsis truncation
- Prevents text wrapping and overlap issues on mobile

**Technical details:**
- `InlineTranslation` component uses `truncate` class universally (previously `md:truncate` only)
- Positioned with `absolute left-0 right-0 bottom-full` and `z-20`
- Ensures consistent behavior across desktop and mobile

**Implementation:** `apps/ui/components/training/TrainingCard.tsx` (line ~412)

---

### Badge Tooltips
**Added:** 2026-01-13 and 2026-01-14 (Sprint: UI Polish)
**User Stories:** US-003, US-004
**Fixes:** 2000NL-022, 2000NL-023

**Behavior:**
- Definition number badges show "Definitie X van Y" tooltip on hover (both main card and sidebar)
- Mode badges (W→D / D→W indicators) use styled `Tooltip` component instead of browser default `title` attributes
- Consistent tooltip styling across entire app

**Implementation:**
- Main card: `apps/ui/components/training/TrainingCard.tsx`
- Sidebar: `apps/ui/components/training/SidebarCard.tsx`
- Component: `apps/ui/components/Tooltip.tsx`

---

## Data Model

### Key Tables

**`user_word_status`**
- Tracks user progress per word
- FSRS fields: `stability`, `difficulty`, `last_interval`
- `source`: "new" (first encounter) | "review" | "practice"
- `hidden`: Boolean flag for excluded words
- `last_review`: Timestamp of most recent review
- `review_count`: Total number of reviews

**`user_review_log`**
- Audit trail of all review events
- `grade`: 1 (again) | 2 (hard) | 3 (good) | 4 (easy)
- `interval_after`: Next review interval after this action
- `review_type`: "review" | "practice" | "click" (sidebar lookup)
- Used by SRS history script for debugging

**`word_entries`**
- Dutch words with headword and definitions
- `headword`: Primary word form (e.g., "fietsen")

**`word_forms`**
- Word variations and conjugations
- `form`: Specific word form (e.g., "fiets", "gefietst")
- Links to parent word entry

---

## Codebase Structure

### UI Components
- **Location:** `apps/ui/components/training/`
- `TrainingScreen.tsx`: Main training page, orchestrates card flow
- `TrainingCard.tsx`: Main card display with word/definition
- `FirstTimeButtonGroup.tsx`: Two-button interface for first encounters
- `ActionButtons.tsx`: Standard four-button interface
- `SidebarCard.tsx`: Recent opgezocht (looked-up words) display
- `Tooltip.tsx`: Styled tooltip component (reusable)

### Types
- **Location:** `apps/ui/lib/types.ts`
- `TrainingWord`: Card data with `isFirstEncounter`, `mode`, etc.
- Typed interfaces for RPC responses and UI state

### Service Logic
- **Location:** `apps/ui/lib/trainingService.ts`
- `fetchNextWord()`: Get next card from backend queue
- `recordReview()`: Submit user action to backend
- `fetchTrainingWordByLookup()`: Load word by ID or headword (for URL params)
- Maps RPC responses to frontend types

### Utilities
- `apps/ui/lib/wordUtils.ts`: `getPrimaryMeaning()`, `buildSegments()`
- `apps/ui/lib/cardParams.ts`: `useCardParams()`, `parseCardParams()` (URL param parsing)

### Database Scripts
- `db/scripts/psql_supabase.sh`: Connect to Supabase database
- `db/scripts/srs_history.sh`: SRS history analysis tool

### Testing
- **Location:** `apps/ui/tests/`
- Type checking: `npx tsc --noEmit` from `apps/ui/` directory
- Unit tests: `npx vitest run` from `apps/ui/` directory
- Browser verification: Chrome DevTools MCP (for UI changes)

---

## Backend Integration

### RPC Functions (Supabase)

**`get_next_training_word_with_stats(userId, wordId?)`**
- Returns next card for user's queue
- Includes `stats.source` ("new" | "review" | "practice")
- Selects card mode (W→D or D→W) based on scenario
- Optional `wordId` parameter for forced card loads (URL testing)

**`record_training_review(userId, wordId, grade, ...)`**
- Records user action (again/hard/good/easy/hide)
- Updates FSRS fields (stability, difficulty, interval)
- Calculates next review timestamp
- Returns new card state

### Queue Mechanism

Frontend uses `forcedNextWordIdRef` to bypass normal queue:
- Set `forcedNextWordIdRef.current = wordId` to force specific card
- Next `fetchNextWord()` call loads that word
- Used by URL testing params and manual testing

---

## Recent Changes Summary

### 2026-01-14: Learning UX & Testing Tools Sprint
- **9 user stories** (US-029, US-027.1-027.3, US-030.1-030.5)
- First-time card learning with 2-button interface
- URL testing parameters for direct card access
- SRS history debugging script
- Forced W→D direction for first encounters

### 2026-01-13: UI Polish Sprint
- **4 user stories** (US-001 through US-004)
- Unknown word tap feedback with sidebar messages
- Translation overlay overlap fix (mobile)
- Badge tooltips on main card and sidebar
- Consistent Tooltip component usage

---

## Development Patterns

### Adding New Features
1. Read this file first to understand existing behavior
2. Check if similar patterns exist (reuse components/utilities)
3. Add types to `types.ts` if introducing new data structures
4. Use `Tooltip` component for hover popups (not `title` attributes)
5. Always include `npx tsc --noEmit` typecheck in acceptance criteria
6. Update this file with new feature after completion

### Testing
- **Type safety:** `npx tsc --noEmit` (no errors = passing)
- **Unit tests:** `npx vitest run` for logic tests
- **Browser verification:** Chrome DevTools MCP for UI changes
- **URL params:** Use `/?wordId=test&devMode=true` for targeted testing

### Database Access
- Use `db/scripts/psql_supabase.sh` for manual queries
- Set `SUPABASE_DB_URL` or `DATABASE_URL` env var
- Check `user_review_log` for review history debugging

---

## Non-Goals and Deferred Features

**Not implemented (future enhancements):**
- Mobile swipe gestures for card actions (2000NL-031, 3 story points)
- Template switcher UI (deferred to Phase 2)
- Keyboard navigation for cards (pending clarification)
- Known words management UI (unhide words from settings)
- Changes to FSRS algorithm parameters

---

## Usage for Ralph Agents

**Before planning a sprint:**
1. Read this file to understand current app behavior
2. Check if related features exist (avoid duplication or conflicts)
3. Identify dependencies based on existing functionality
4. Reference codebase structure section for file locations

**After completing a story:**
1. Update this file with new behavior (what changed, how to use it)
2. Keep descriptions concise (2-4 sentences per feature)
3. Include file locations and key patterns for future reference

**When debugging:**
- Check "Recent Changes" section for recently added features
- Use SRS history script for queue/interval issues
- Use URL params for targeted card testing
- Reference data model for database queries

---

_This document is automatically maintained by Ralph agents and should be the first reference for understanding 2000nl app behavior._
