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
