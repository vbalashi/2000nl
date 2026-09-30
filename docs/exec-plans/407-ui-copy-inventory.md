# Approved prototype UI copy inventory

Date: 2026-09-30. Required interface locales: English, Dutch, Russian. This is an integration checklist for the approved design, not a claim that the entire prototype is already localized. User-supplied training/collection names, dictionary entries, example sentences, and generated translations are content; do not put them in UI catalogs. Variations, comparison views, inspectors and other development controls stay in the prototype.

## First localized slice

`apps/ui/locales/{en,nl,ru}.json` owns `ui.navigation`, `ui.trainingOverview`, `ui.builder`, `ui.builderScope`, `ui.settings`, `ui.languagePicker`, and `ui.trainingHotkeys`. The shared `AppDestinationNav`, `AppFrame`, and `TrainingOverview` read those catalogs. The prototype's interface-language selector drives the Training overview, primary navigation, and all Builder sections and save/delete dialogs. This selector remains prototype state; the production preference owner must replace it in the real Settings flow.

The first slice covers visible labels, accessible names, loading/error/empty states, resume/start/edit/create actions, progress, source-unavailable notices, exercise/direction/language labels, exercise counts with locale plural rules, and the illustrative-activity note. Saved training and source names remain data. `tests/uiMessages.test.ts` rejects missing/blank keys or mismatched placeholders in EN/NL/RU.

## Builder localization checkpoint

Builder sections, summaries, exercise and answer-mode choices, lexical filters, size/balance controls, availability/error/retry messages, and save/main/delete actions now use the existing catalogs. Meaning counts use locale plural and number formatting. Language names use ISO codes from the preview catalog and `Intl.DisplayNames`; selected values and IDs stay stable. Direction examples and sentence samples retain their own `lang` attributes. Shared prototype dialogs and direction controls read the interface locale through context, including their accessible names.

Component checks cover changing locale without losing search/selection, stable language/source/direction callbacks, sentence-language notices, and deletion with a user-supplied name. Mobile labels wrap; larger text puts section summaries on a second row. Development-only Variations, inspectors, and comparison banners retain their development copy. Training session/history, Library, and Statistics still require localization. The local DB health warnings remain separate from fixture-backed Builder browser checks.

Validation: 24 focused tests, typecheck, targeted lint, and shared style guard passed. Fixture-backed browser checks covered EN/NL/RU at 320/430/1024px in standard and maximum text size; four additional NL/RU mobile checks verified the revised heading layout and sentence-translation choice. No horizontal page/dialog overflow was observed after the layout fix.

## Settings localization checkpoint

All six Settings sections and the shared language picker now use EN/NL/RU catalogs, including accessible names, empty results, theme/text-size names, disabled billing/account placeholders, and dictionary inventory counts. The existing training shortcut/rating labels were moved into the same catalogs without changing their text or hotkey IDs. Locale changes preserve section, language order/paused state, dictionary switches, search queries and canonical callback values. Interface language and dictionary content languages remain distinct.

Language search accepts English, Dutch, Russian, native names and ISO aliases; selection still emits canonical names. Long localized language names wrap, and theme choices use a responsive grid so maximum text does not overlap. The shared Library article inside Appearance is still a preview of the pending Library localization slice; its content and controls were not independently duplicated for Settings.

Validation: 33 tests across six suites (Settings/count/catalog, Builder, existing training reveal/actions and shared presentation/ratings), typecheck, targeted lint and shared theme guard passed. Fixture-backed browser checks cover all six sections and picker empty/close at EN/NL/RU, 320/430/1024px, standard/maximum text size. A 320px Russian language-row overflow and overlapping theme names found during inspection were corrected and rechecked. Three further 320px maximum-text checks verified the final language-row wrapping. No backend preference wiring or database changes are part of this checkpoint. Next: Training session/history localization, then Library/Statistics.

## Remaining approved surfaces and copy to migrate with each screen

| Surface and source | User-facing copy to inventory and localize | Integration boundary |
| --- | --- | --- |
| Training: `TrainingSessionPrototype`, `SessionCardActions`, `RecentActivity`, shared `RatingControls` | Session title/progress, prompt and reveal, rating labels, report/exclude menu, known/undo, history filters and empty states, close/confirmation, audio/translation loading and errors, accessible controls | Reuse production action semantics and translation request path. The answer and full-word panel must use the same article presentation as Library. |
| Library: `LibraryPrototype`, `LibraryFilters`, `LibraryArticle`, `LibraryOverlays`, `LibraryActions`, `LibraryStudyPanel`, `LibraryWordDetails` | Search, filter steps and counts, article/part labels, result and no-result states, study status, details/relations headings, collection actions, report/known/exclude, dialogs, audio/translation feedback | Dictionary and translated article content are not UI messages. Preserve shared word/article components. |
| Statistics: `StatisticsPrototype` | Section titles, metrics, date/number units, material controls, activity/history entry, empty/loading/errors, accessible chart labels | Counts and dates require locale formatting from real activity; do not transplant illustrative fixture values. |
| Settings: `SettingsPrototype`, `LanguagePicker` (localized) | EN/NL/RU copy complete; Library preview follows the shared Library localization slice | Bind real preference owner on integration. Inert prototype controls must not be presented as working production features. |
| Shared shell: `AppFrame`, `AppUtilityNav`, `SettingsDestination` | Navigation, settings, utility actions, keyboard descriptions, responsive menu labels | Migrate remaining component-local EN/NL/RU maps into the same catalogs when their screen is integrated. |

For each screen, review every button, menu, label, placeholder, tooltip, live announcement, empty/error/loading state, confirmation and screen-reader name. Check keys and interpolation parameters in all three catalogs, and verify at 320/430px plus large text size. Do not show raw message keys to users; key completeness is required before accepting the slice. Test long Dutch/Russian actions in the browser and verify that content language is marked separately from interface language where applicable.
