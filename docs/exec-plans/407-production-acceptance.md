# #407 — working UI acceptance and transfer boundary

Date: 2026-10-01. Implementation checkpoint: `a58fdaee` on
`codex/407-builder-prototype`, project-local `.worktrees/407-builder-prototype`.
Status: implemented behind reversible presentation flags; owner visual acceptance
is pending. This document does not authorize deployment, merging or flag changes.

## Approved recipe

- Inter for UI; Newsreader for dictionary reading. Headword article is smaller,
  lighter and subordinate. Definitions/examples/translations use shared roles.
- Lavender / Blue / Graphite with Light / Dark / System. Account-owned palette
  and mode; nested panels inherit the same semantic tokens.
- One Text size strip, four positions; reading 100/125/150/200%, interface
  100/115/130/150%, already-large display 100/108/118/130%. Existing phone and
  desktop profiles remain independent; viewport changes do not reset preference.
- Builder: inline expanding frames; Language, Source, Exercises, Filters,
  Session initially collapsed. Library POS filters use chips. Translation has
  one reverse sentence-direction preview. No copied fixture queue/state.
- Ordinary training: frameless session progress, pinned actions, independently
  scrolling reading content; metadata and prompt remain available. One-row
  ratings use 46px baseline, two-row ratings 28px baseline; chosen text is not
  shrunk to force a row. Library actions remain compact.
- Word panel enters first, then expands the current meaning. Shared article and
  forms render in Library and Training; no nested morphology disclosure.
- Report is left, Exclude right in Training. Exclude offers headword exclusion
  or Known. Library puts collections left and Exclude/Known/Report in its menu.
- Latest 50 accepted actions, no 24-hour window, available from session and
  Statistics. Active study time excludes background, loss of focus and overlays.
- Variations and illustrative records remain development-only.

## Requirement-by-requirement evidence

| Requirement | Owning source | Verification / limits |
| --- | --- | --- |
| Same article across Library, Training answer and full-word panel | `ProductionArticleReading`, shared forms/relation renderer; `LibrarySenseCardV2Session`, `TrainingSenseCardV2Session` | Shared article tests; live Library/word-panel, sequential current-meaning reveal and short/zoom viewport checks in integration log. |
| Proportional typography and three palettes | `lib/reading/textScale.ts`, reading profile owner, `practiceTheme.module.css`, account appearance provider | Four-scale persistence/profile tests; six-palette contrast assertions; live Settings maximum-size and palette reload checks. |
| EN/NL/RU UI messages | `locales/{en,nl,ru}.json`, `lib/uiMessages.ts` | Catalog key/placeholder checks and per-screen localized layout acceptance; dictionary content and user names are not UI translations. |
| Overview, saved setups and main training | `AccountTrainingOverview`, setup API/repository, `ApprovedTrainingBuilder` | Server-owned save/update/delete/main persistence and live builder/overview checks; browser preset migration intentionally absent. |
| Learning language, source and translation settings | `ApprovedSettingsDestination`, `MaterialSettings`, material preference API; existing translation owner | Account revision/ACL checks, new-run eligibility and continue-paused-session tests; arbitrary translation picker and Off behavior integrated. |
| Real Library search/filter/collections | `AccountLibraryFilters`, Library owner and existing lookup/collection endpoints | Live search/chips/source scope, real collections, failure recovery, dialogs and short viewport checks. |
| Statistics, material and history | `AccountStatistics`, shared recent-history server reader | Actual activity and material read models; bounded all-time latest-50 query and access isolation; active-time receipts verified under real focus loss. |
| Reveal, grading, continuation and full-word motion | Meaning/idiom/sentence session owners, `usePromptReveal`, shared panel | Live ordinary and idiom accepted actions, next/reload/history checks; actual provider sentence reveal/grade/reload. Sentence parent-callback reset regression fixed in `c2b84975`. |
| Known selected direction | RPC/action owner, migration193 | 29 disposable SQL files / 278 tests; live Library mark and exact Undo after local193: only word-to-definition persisted, no active mark left after Undo. Historical paired marks/receipts/Undo retained. |
| Exclude headword across ordinary word training | Explicit headword exclusion RPC, migration192 | Sibling/future meanings, both directions, independent audio/idiom/sentence, races/receipts/ACL tests; live Training consumption and Library exact Undo. No FSRS or Known rewrites. |
| Report/audio existing behavior | Existing report/audio owners and shared action presentation | Report layout/modal attention and component action checks; delivery retains existing endpoint, not preview no-op. Audio remains its existing independent family. |
| Actions visible / keyboard / zoom / reduced motion | Shared session/layout/panel/ratings modules | Live native Chrome200%/400% ordinary Training and Library, controlled short/Extra/localized panels, focus restore/Escape/reduced-motion tests. Not a universal device or screen-reader certification. |
| Production boundaries and packaging | Root working adapters, rollout gates | Optimized build and actual root bundle inspection at prior checkpoint; no prototype module in root factories. Dev prototype404 and test-session404 in production mode. No deployment performed. |

Latest checks after193: 278 SQL tests, UI typecheck,73-file guidance check;
41 focused presentation/catalog/appearance/article/overview tests; shared style
guard and legacy literal ratchet1362; local managed forward apply/check reports
compatible contract193. Prior full UI run196 files/1593 tests passed. These counts
are suite-specific, not additive unique tests. No broad check is claimed solely
from a narrow assertion.

Detailed real-browser evidence, exact commands, failures repaired and screenshot
paths are retained in [integration log](407-integration-readiness.md). Successful
live193 Known screenshot: `/tmp/407qa/directional-known-library-marked.png`.
Temporary screenshots are QA evidence, not permanent product assets.

## Explicit boundaries and remaining acceptance

1. Owner reviews the working root UI on canonical local3100, rather than a
   prototype URL. Check Training overview/builder/session, Library full word and
   filters, Statistics/history, Settings; compare mobile and desktop.
2. Record any concrete mismatch before changing agreed defaults. EN/NL/RU,
   maximum text and dark mode should be included in owner review where practical.
3. After acceptance, freeze the exact implementation commit and separately agree
   rollout/merge/deployment. Existing flags stay unchanged; sentence rollout is
   independently gated despite successful opt-in local provider QA.

Legacy flag-off screens retain1362 literal occurrences under a no-growth ratchet.
That is fallback debt, not1362 new theme colours or proof that every legacy style
was unified. Shared approved CSS rejects untokenized colours/fixed pixel font
sizes. Optical rails, chart geometry and animation measurements are not blindly
replaced with text/spacing tokens.

Billing/payment features and new audio-product design are not created by this UI
transfer; the approved account screen exposes working profile/sign-out rather
than inert billing controls. Production provider keys are never bundled or
committed. Native device/screen-reader testing and deployment are not certified
by the local functional/layout checks.
