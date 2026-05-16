# Card Types (Scenarios)

Card types define what is shown on the prompt vs reveal side for training. The registry is a shared contract, while the current production UI implements the active Dutch modes directly in `apps/ui/components/training/TrainingCard.tsx` and related helpers.

Registry: `packages/shared/card-types/card-types.json`.

Current primitives:
- `word-to-definition`: prompt shows `headword` + optional `part_of_speech`/`gender`; reveal shows `definition` (+ examples). Input mode: show-answer.
- `definition-to-word`: prompt shows `definition`; reveal shows `headword` + extra fields. Current input mode is show-answer grading, not typed answer checking.
- Extendable: audio-first cards, spelling drills, or multiple-choice require both registry updates and implementation in UI/DB selection logic.

Rendering rules:
- UI rendering currently reads `word_entries.raw` through `wordUtils` and `TrainingCard` helpers. Registry-driven rendering remains the intended extension point, not a complete runtime abstraction.
- Examples and idioms are optional and shown when present.
- Multi-meaning entries can select `meanings[n]` or pick one at session build time.

Progress tracking:
- Progress is per `user_id + word_id + mode` using `user_word_status`.
- Event stream (`user_events`) captures granular actions (clicks, reveals, answers) to tune scheduling.
