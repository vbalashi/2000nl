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

1. **Card Queue**: The UI calls `get_next_card` through `apps/ui/lib/training/selectionService.ts`. Postgres chooses due/new cards, while the UI passes list scope, card filter, scenario, queue-turn hints, and session exclusions.
2. **Card Presentation**: User sees either:
   - **Word → Definition (W→D)**: Dutch word shown, user recalls meaning
   - **Definition → Word (D→W)**: Meaning shown, user recalls Dutch word
3. **User Actions**:
   - `again` / `fail`: Didn't remember, restart learning
   - `hard`: Remembered with difficulty
   - `good`: Remembered correctly
   - `easy`: Remembered easily
   - `start-learning`: Begin learning a new card; recorded separately from a graded recall attempt
   - `mark-known`: Exclude this card from training without erasing its existing FSRS progress
4. **Interval Calculation**: `handle_card_review` records the action and updates FSRS state. The UI sends a client-generated `turnId` when available so duplicate submits are no-ops.

### Word States

- **New**: Card has not started learning
  - The V2 capability contract determines its prompt and available actions
  - The answer offers **Learn**; **Mark as known** is a separate action
  - Learn does not invent an Again rating; first exposure and graded recall remain distinct events
- **Learning** (`source="learning"`): Active sub-day learning step with FSRS interval under one day
  - Shows standard **4-button interface** (again/hard/good/easy)
  - Direction varies based on backend scenario selection
- **Review** (`source="review"`): Graduated card due or in review rotation
  - Shows standard **4-button interface** (again/hard/good/easy)
  - Direction varies based on backend scenario selection
- **Known**: Explicit user mark stored in `user_card_known_marks`
  - Excluded from training; any existing scheduling state is preserved
  - Separate from the older Hide/Freeze operations, which are not controls in the current Training details screen

### Card Components

- **Main Card**: Large central card showing current word/definition
- **Details Drawer**: On-demand word details opened from answer-card actions or linked dictionary text; there is no permanent sidebar
- **Training History**: A separate, code-split destination showing the authenticated latest 50 learning-start/review events from the server-owned 24-hour window without remounting the current Training session
- **Action Buttons**:
  - `TrainingSenseCardV2Session` executes the typed capabilities supplied to the shared V2 stage
  - The stage owns Learn, rating buttons, known marks, audio, translation, and Details entry points
  - `TrainingScreen` coordinates the session; it does not render a second legacy rating bar

## Related Docs

- Feature history and current UX details: [features.md](./features.md)
- Testing and debugging helpers: [developer-tools.md](./developer-tools.md)
- Data model and backend integration: [technical-model.md](./technical-model.md)
