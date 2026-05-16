# App Behavior Features: Training UX

### Left-Edge Swipe Navigation (Recent Opgezocht)
**Added:** 2026-01-29
**User Story:** US-071.1

Edge swipe closes the Recent opgezocht panel instead of triggering back navigation.

### Audio Mode Definition Playback
**Added:** 2026-01-29
**User Story:** US-055.1

Definition and sentence taps play full-sentence audio in audio mode.

### Line Spacing Consistency (Examples)
**Added:** 2026-01-29
**User Story:** US-063.1

Example spacing is aligned across card types.

### Preload Next Card for Speed
**Added:** 2026-02-06
**User Story:** US-075.1

Next-card data and assets are prefetched in the background.

### Swipe Gesture Visual Feedback (Training Cards)
**Added:** 2026-02-06
**User Story:** US-068.1

Cards and action buttons reflect swipe direction and intensity.

### Swipe Gestures for First-Encounter Choice
**Added:** 2026-02-06
**User Story:** US-069.1

First-encounter cards support swipe-based start/hide actions.

### Hide Past Perfect Participle in Definitions
**Added:** 2026-02-06
**User Story:** US-026.1

Verb hints preserve grammar without revealing the answer.

### Mobile Card Height Hybrid Approach
**Added:** 2026-02-06
**User Story:** US-065.1

Cards use min/max height with internal scrolling on mobile.

### Training Card Layout Fixes for Edge-Case Words
**Added:** 2026-02-06
**User Story:** US-084.1

Spacing is more robust for awkward words and long content.

### Client-Side Review Turn ID (Idempotency)
**Added:** 2026-02-09
**User Story:** US-093.2

Each presented card gets a unique `turnId`, reused on retries.

### Backend Review Idempotency Guard (turnId)
**Added:** 2026-02-09
**User Story:** US-093.3

Repeated `turnId` submissions no-op on the backend.

### Backend Review Temporal Guard (legacy clients)
**Added:** 2026-02-09
**User Story:** US-093.4

Legacy clients are protected by a short anti-duplicate time window.

### Regression Tests (Double-Submit Prevention)
**Added:** 2026-02-09
**User Story:** US-093.5

The test suite covers duplicate submit prevention.

### Cross-Reference-Only Word Filtering
**Added:** 2026-01-14
**User Story:** US-020

Cross-reference-only entries do not enter the learning queue.

### Mobile Swipe Gestures for Training Cards
**Added:** 2026-01-14
**User Story:** US-031

Mobile cards support swipe gestures for review actions.

### First-Time Learning UX
**Added:** 2026-01-14
**User Stories:** US-030.1 through US-030.5

First encounters use a dedicated two-button flow and W→D direction.

### Unknown Word Tap Feedback
**Added:** 2026-01-13
**User Story:** US-001

Unknown taps produce explicit sidebar feedback.

### Badge Tooltips
**Added:** 2026-01-13 and 2026-01-14
**User Stories:** US-003, US-004

Main card and sidebar badges use shared tooltip styling.

## Recent Changes Summary

### 2026-01-14: Learning UX & Testing Tools Sprint
- first-time learning UX
- URL testing parameters
- SRS history debugging script
- W→D override for first encounters

### 2026-01-13: UI Polish Sprint
- unknown-word feedback
- mobile overlay fix
- badge tooltip consistency

## Non-Goals And Deferred Features

- Template switcher UI
- Keyboard navigation for cards
- Known words management UI
- Further FSRS parameter changes
