# Card Types (Scenarios)

Card types define what is shown on the prompt vs reveal side for training. They are language-agnostic but reference fields present in each language template.

Registry: `packages/shared/card-types/card-types.json`.

Current primitives:
- `word-to-definition`: prompt shows `headword` + optional `part_of_speech`/`gender`; reveal shows `definition` (+ examples). Input mode: show-answer.
- `definition-to-word`: prompt shows `definition` (and optionally a sample sentence); reveal shows `headword` + extra fields. Input mode: type-in.
- Extendable: audio-first cards, spelling drills, or multiple-choice by adding new entries to the registry.

Rendering rules:
- UI selects prompt/reveal fields from registry; per-language overrides allowed by choosing different field paths.
- Examples and idioms are optional and shown when present.
- Multi-meaning entries can select `meanings[n]` or pick one at session build time.

Progress tracking:
- Progress is per `user_id + headword_id + card_type` using `user_progress` table.
- Event stream (`user_events`) captures granular actions (clicks, reveals, answers) to tune scheduling.
