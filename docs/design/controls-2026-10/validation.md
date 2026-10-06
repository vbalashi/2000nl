# Source-backed preview validation

2026-10-06, issue #596. No production application files changed.

- Built a 400 KB inline preview from ApprovedTrainingBuilder and its actual dependencies. Section bodies are copied without structural edits; preview changes are the agreed name presentation, Delete label and scoped control/footer CSS.
- Repeated standalone browser checks pass for family exclusivity, actual Russian/Dutch Translation example, Words/Idioms directions, retaining the last direction, disabled Type the answer, translation Off, dictionary deselection/start gating, multiple parts of speech, noun de/het popup, activity days-ago input, session size/mix scales and dependent reset rules.
- Name edit, direct Save changes, Save as name dialog and Delete confirmation pass. No exercise checkbox inputs exist. Chevron SVG is present in both the standalone document and directly opened fragment.
- en/ru/nl at 320px have no horizontal document overflow. Light/dark expanded specimens saved as builder-real-expanded-* screenshots. All preview page-error lists are empty.
- 16 source-component tests pass across ApprovedTrainingBuilderActions, builderLocalization and TrainingSessionSizePicker. Full account catalog, asynchronous loading/error cases, scheduling/persistence and all appearance profiles remain outside this fixture review; do not treat the preview as production certification.

Repeatable commands and fixture details: [source/README.md](source/README.md).

## Direct fragment layout regression

The owner's screenshot exposed a missing check: earlier direct-fragment QA checked only the chevron, not layout. The fragment has no doctype and therefore opens in quirks mode. Minified CSS module selectors contained 31 case-insensitive collisions (for example `.G` and `.g`), which caused unrelated layout and colour rules to match.

The build now assigns readable module names before compacting the finished JavaScript and CSS. A build guard rejects case-insensitive selector collisions. Rebuilt both preview files successfully; the fragment is 400,016 bytes and the collision guard passes. Existing screenshot proofs above predate this correction. Updated visual verification is pending: the browser tool rejected access to the file URL, so no alternate browser route was used to bypass that restriction.

## Owner annotations, seven refinements

Applied to the prototype only: shared selected surface for Nouns and its subfilter arrow; default answer mode omitted from exercise summary; quiet 11px rhythm help; consistent 12px field labels; settings-matched 11px regular-weight compact choices; transparent sections with neutral 18% borders; 8px indentation for parts-of-speech choices. Reference: ApprovedAppearanceSection / SettingsOptions and settings.module.css, rather than a guessed production font. Both Nouns actions retain separate keyboard and accessible semantics. Source summary assertion, bundle collision guard and diff check pass. Browser visual verification remains pending under the previously reported file-URL restriction.

## Grouped sections and source-list exploration

Two layout choices (single frame with inset dividers / filled group with 4px canvas gaps), each with desktop/mobile preview sizing. Inline language choices, compact body top padding, frame-coloured disclosure arrows, full-width Session note with Info icon. SourcePicker replaces mode choices with typed rows using existing dictionaries/lists, preserving multiple-dictionary OR single-collection semantics; search/type filter is revealed by icon above 10 entries. Current fixture contains only two source entries; large-list browser verification remains pending. Exercise summary uses explicit family policy in source/summary.ts. Changes are prototype adapters, not production code. Build and CSS collision guard pass; no new visual/browser verification claimed.
