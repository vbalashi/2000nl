# App Behavior: Core

## Overview

2000nl is a Dutch vocabulary learning web app using SRS-style training. The backend uses the FSRS algorithm to optimize intervals based on user performance.

**Tech stack:**
- Next.js (App Router, single-page app)
- TypeScript
- Supabase (PostgreSQL database)
- FSRS algorithm for spaced repetition

## Core Concepts

### Training Flow

1. **Card Queue**: Backend RPC (`get_next_training_word_with_stats`) manages card selection and queue.
2. **Card Presentation**: User sees either:
   - **Word → Definition (W→D)**: Dutch word shown, user recalls meaning
   - **Definition → Word (D→W)**: Meaning shown, user recalls Dutch word
3. **User Actions**:
   - `again` (fail): Didn't remember, restart learning
   - `hard`: Remembered with difficulty
   - `good`: Remembered correctly
   - `easy`: Remembered easily
   - `hide`: Exclude word from queue (user already knows it)
4. **Interval Calculation**: FSRS algorithm adjusts next review interval based on action.

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

## Related Docs

- Feature history and current UX details: [features.md](./features.md)
- Testing and debugging helpers: [developer-tools.md](./developer-tools.md)
- Data model and backend integration: [technical-model.md](./technical-model.md)
