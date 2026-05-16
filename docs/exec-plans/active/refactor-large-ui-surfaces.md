# Refactor Large UI Surfaces

## Goal

Prepare a low-risk refactor plan for the largest UI files without changing the training experience before the planned designer review is incorporated.

## Context

Current large files:

- `apps/ui/components/training/TrainingScreen.tsx` - roughly 2.7k lines; owns session orchestration, settings persistence, audio/TTS, onboarding, sidebars, queue transitions, and action handling.
- `apps/ui/components/training/TrainingCard.tsx` - roughly 1.4k lines; owns card rendering across modes, translations, examples, idioms, badges, audio affordances, and reveal states.
- `apps/ui/lib/trainingService.ts` - roughly 1.8k lines; owns Supabase RPC calls, mapping, list/search operations, review recording, preferences, and fallbacks.

The user plans to review selected screens with a designer and may change the UI direction afterward. Do not do visual restructuring, layout rewrites, naming-copy changes, or component extraction that would make designer feedback harder to apply.

## Constraints

- Preserve rendered UI and user workflows unless a separate product/design task explicitly says otherwise.
- Keep extraction mechanical and behavior-preserving.
- Prefer pure helper extraction, typed service modules, and small hooks over moving JSX into new visual components.
- Do not change training card layout, spacing, copy, or responsive behavior as part of this refactor.
- Keep tests green after each small step.

## Suggested Agent Task

Analyze the three large files and propose a staged decomposition plan. The output should be a concrete, file-by-file plan rather than implementation.

Include:

- responsibility map for each file
- candidate extraction boundaries
- safest first extraction with low merge/design risk
- tests that should protect each extraction
- risks from pending designer review
- changes explicitly out of scope until design direction is final

Recommended initial extraction candidates:

- `trainingService.ts`: split typed mappers and list/search helpers from review/session RPC helpers.
- `TrainingScreen.tsx`: extract non-visual hooks for persisted settings, training debug state, and audio/TTS orchestration.
- `TrainingCard.tsx`: postpone visual component extraction until designer review; only consider pure text/translation helper extraction first.

## Validation

- `cd apps/ui && npm run lint`
- `cd apps/ui && npm test`
- If any visual extraction is later approved, verify with Playwright/screenshots before merging.
