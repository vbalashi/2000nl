# Approved prototype UI copy inventory

Date: 2026-09-29. Required interface locales: English, Dutch, Russian. This is an integration checklist for the approved design, not a claim that the entire prototype is already localized. User-supplied training/collection names, dictionary entries, example sentences, and generated translations are content; do not put them in UI catalogs. Variations, comparison views, inspectors and other development controls stay in the prototype.

## First localized slice

`apps/ui/locales/{en,nl,ru}.json` now owns `ui.navigation` and `ui.trainingOverview`. The shared `AppDestinationNav`, `AppFrame`, and `TrainingOverview` read those catalogs. The prototype's interface-language selector drives the Training overview and primary navigation so the three locales can be checked before production integration. This selector remains prototype state; the production preference owner must replace it in the real Settings flow.

The first slice covers visible labels, accessible names, loading/error/empty states, resume/start/edit/create actions, progress, source-unavailable notices, exercise/direction/language labels, exercise counts with locale plural rules, and the illustrative-activity note. Saved training and source names remain data. `tests/uiMessages.test.ts` rejects missing/blank keys or mismatched placeholders in EN/NL/RU.

## Remaining approved surfaces and copy to migrate with each screen

| Surface and source | User-facing copy to inventory and localize | Integration boundary |
| --- | --- | --- |
| Builder: `BuilderPrototype`, `BuilderScopePicker`, `TranslationDirectionPreview`, `SavedTrainingControls` | Section names and summaries; language/source/part-of-speech selectors; exercise type/direction/answer mode; session size/balance; availability/loading/error/empty; save/edit/delete/main-training confirmation; accessibility names | UI choices stay separate from fixture IDs and source names. Translate before production builder acceptance. |
| Training: `TrainingSessionPrototype`, `SessionCardActions`, `RecentActivity`, shared `RatingControls` | Session title/progress, prompt and reveal, rating labels, report/exclude menu, known/undo, history filters and empty states, close/confirmation, audio/translation loading and errors, accessible controls | Reuse production action semantics and translation request path. The answer and full-word panel must use the same article presentation as Library. |
| Library: `LibraryPrototype`, `LibraryFilters`, `LibraryArticle`, `LibraryOverlays`, `LibraryActions`, `LibraryStudyPanel`, `LibraryWordDetails` | Search, filter steps and counts, article/part labels, result and no-result states, study status, details/relations headings, collection actions, report/known/exclude, dialogs, audio/translation feedback | Dictionary and translated article content are not UI messages. Preserve shared word/article components. |
| Statistics: `StatisticsPrototype` | Section titles, metrics, date/number units, material controls, activity/history entry, empty/loading/errors, accessible chart labels | Counts and dates require locale formatting from real activity; do not transplant illustrative fixture values. |
| Settings: `SettingsPrototype`, `LanguagePicker` | Language controls, themes and text sizes, active/paused dictionaries, shortcuts, billing/account placeholders, accessible names and notices | Bind real preference owner on integration. Inert prototype controls must not be presented as working production features. |
| Shared shell: `AppFrame`, `AppUtilityNav`, `SettingsDestination`, `trainingHotkeys` | Navigation, settings, utility actions, keyboard descriptions, responsive menu labels | Migrate remaining component-local EN/NL/RU maps into the same catalogs when their screen is integrated. |

For each screen, review every button, menu, label, placeholder, tooltip, live announcement, empty/error/loading state, confirmation and screen-reader name. Check keys and interpolation parameters in all three catalogs, and verify at 320/430px plus large text size. Do not show raw message keys to users; key completeness is required before accepting the slice. Test long Dutch/Russian actions in the browser and verify that content language is marked separately from interface language where applicable.
