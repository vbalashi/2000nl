# App Behavior: Core

## Overview

2000nl is a Dutch vocabulary learning web app using SRS-style training. Scheduling and review mutations are backed by Supabase/Postgres RPCs that implement FSRS-6 behavior.

**Tech stack:**
- Next.js (App Router, single-page app)
- TypeScript
- Supabase (PostgreSQL database)
- FSRS algorithm for spaced repetition

## Core Concepts

### Training Flow

1. **Card Queue**: The UI calls `get_next_word` through `apps/ui/lib/training/selectionService.ts`. Postgres chooses due/new cards, while the UI passes list scope, card filter, scenario, queue-turn hints, and session exclusions.
2. **Card Presentation**: User sees either:
   - **Word → Definition (W→D)**: Dutch word shown, user recalls meaning
   - **Definition → Word (D→W)**: Meaning shown, user recalls Dutch word
3. **User Actions**:
   - `again` / `fail`: Didn't remember, restart learning
   - `hard`: Remembered with difficulty
   - `good`: Remembered correctly
   - `easy`: Remembered easily
   - `hide`: Exclude word from queue (user already knows it)
4. **Interval Calculation**: `handle_review` records the action and updates FSRS state. The UI sends a client-generated `turnId` when available so duplicate submits are no-ops.

### Word States

- **First Encounter** (`source="new"`): Word never seen before
  - Shows **FirstTimeButtonGroup** (2 buttons)
  - Always displays in **W→D direction**
  - Actions: "Start learning" (fail) or "I know it already" (hide)
- **Learning** (`source="learning"`): Active sub-day learning step with FSRS interval under one day
  - Shows standard **4-button interface** (again/hard/good/easy)
  - Direction varies based on backend scenario selection
- **Review** (`source="review"`): Graduated card due or in review rotation
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
  - Standard rating buttons are rendered by `TrainingScreen.tsx` for learning/review cards

## Related Docs

- Feature history and current UX details: [features.md](./features.md)
- Testing and debugging helpers: [developer-tools.md](./developer-tools.md)
- Data model and backend integration: [technical-model.md](./technical-model.md)
