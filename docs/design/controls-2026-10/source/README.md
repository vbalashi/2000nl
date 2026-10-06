# Source-backed Session Builder preview

This replaces the first schematic mockup, whose checkbox exercise list was incorrect.

## Build and verify

From the owning worktree root, with its own UI dependencies installed:

```sh
node docs/design/controls-2026-10/source/build.mjs
python3 /Users/khrustal/.codex/plugins/cache/openai-bundled/visualize/1.0.46/skills/visualize/scripts/render.py docs/design/controls-2026-10/session-builder.fragment.html docs/design/controls-2026-10/session-builder.html --force
node docs/design/controls-2026-10/source/validate.cjs
```

Open `session-builder.html`, not an old handwritten fragment. The new generated fragment also has its icons and React runtime bundled, so direct opening no longer loses the save chevron. Font loading is optional.

## What is sourced

`build.mjs` copies `apps/ui/components/training/pilot/ApprovedTrainingBuilder.tsx` and modifies only the inline name presentation and adds the existing delete label beside its existing Trash2 icon. All five section bodies, save-as/delete confirmations, availability predicates, disabled controls and their event handlers come from the original component. It imports the actual BuilderSection, BuilderChoice, DirectionCard, TrainingSessionSizePicker, TrainingMixPicker, locale JSON, noun-article functions and directionExamples; there is no hand-authored parallel exercise model.

The family/mode/mix callbacks and defaultModesForScenario are extracted from `TrainingTodaySetup.tsx`. Build boundary assertions require reviewing the adapter when those source boundaries change. The generated files are snapshots; edit Review.tsx/build.mjs, not the generated snapshots.

Review.tsx applies locally scoped CSS for the approved controls and contains the preview shell/fixture state. It does not change production files. Top navigation is presentation only. Name, save/start callbacks and catalogs are local fixtures, not account mutations. The known VanDale 2k label is used in one collection and one dictionary fixture. The preview has Dutch/English languages, two supported scenarios and no source-provenance catalog. Full live catalogs, loading/error states, auth and database behavior are not claimed as covered here.

The specimen has single exercise-family choice: Words, Idioms, Translation. Translation is word-in-context and shows the actual Russian/Dutch direction example from directionExamples. Words/Idioms allow both directions and cannot lose their last selected direction. Translation has fixed reverse mode. Type the answer is disabled. Dictionary selection and part-of-speech chips remain multiple choice. Empty part selection means all parts; no invented All chip is added. Noun de/het selection, activity source/date controls and session size/mix sliders are retained.

## Validation

validate.cjs opens the standalone file in a clean headless browser and checks exercise exclusivity, both directions and last-direction retention, translation examples, Off translation, disabled typing, dictionary access gating, multi-part filters, noun subfilter dialog, activity date input, actual size/mix steps and dependent resets, name editing, direct Save changes vs save-as dialog, delete confirmation, visible save chevron, light/dark and 320px layouts in en/ru/nl. It records expanded screenshots; no production browser/session is reloaded or changed.

Direction cards retain their existing structure and styling; compact chip overrides must not turn these cards or rating controls into capsule buttons. Future live implementation needs actual account catalogs, loading/error recovery and all appearance profiles checked separately.
