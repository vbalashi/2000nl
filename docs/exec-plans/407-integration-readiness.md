# Prototype integration readiness

Date: 2026-09-29; localization checkpoint updated 2026-09-30. Scope: source-level handoff review and fixture localization validation, not complete production/browser accessibility acceptance.
Baseline: f1ed5fc4 plus pending reveal-clipping, Statistics scrollbar and resumed-session counter fixes.

## Verdict

The prototype is a presentation reference, not a replacement runtime. Transfer shared rendering and approved interaction decisions into the existing production boundaries. Do not copy fixture state, illustrative activity, preview queues or no-op settings as working application behavior.

## Settings and action wiring

| Surface | Current behavior | Integration requirement |
| --- | --- | --- |
| Interface language | Prototype context; approved screens and navigation use EN/NL/RU catalogs | Bind the existing locale owner; translate all labels, including ratings, dialogs and errors. |
| Translation language | Shared prototype selection; exercise generator still hardcodes English → Dutch; fixture translations | Resolve exercise prompts and translations from the selected language. Explicitly handle Off and unavailable translation. |
| Learning languages / dictionary enablement | Local Settings state | Connect account preferences to source eligibility, Library, builder and Statistics; define consequences of pausing/removing a source. |
| Text size | Four working shared scales; local per-device preview persistence | Integrate existing reading preferences provider; explicitly migrate the three-value server contract. |
| Theme / colour mode | Working shared tokens, local persistence, System support | Choose the production preference owner and persistence scope; retain native OS/System behavior. |
| Variations | Experimental development controls, URL/default recipes | Ship approved defaults only; do not expose comparison controls as product settings. |
| Audio | Training displays a preview notice | Reuse production audio implementation and loading/error states. |
| Report | Explicit local preview; nothing sent | Connect existing reporting behavior and delivery/error feedback. |
| Known / Excluded / grading | Preview state/history | Preserve existing action identities and server scheduling semantics; no client-invented learning-state updates. |
| Resume / saved training / activity | Prototype orchestration and sample data | Bind stable session/training IDs and real counts; validate resume after reload, second session today, deletion and source unavailability. |
| Billing / sign-out | Disabled placeholders | Use existing routes/flows; do not ship inert controls as complete features. |

Evidence: `SettingsPrototype.tsx`, `BuilderPrototype.tsx`, `sessionPreviewModel.ts`, `SessionCardActions.tsx`, `LibraryOverlays.tsx`, `usePreviewTextSize.ts`, `components/practice/ui/usePracticeAppearance.ts`.

## Freeze the presentation recipe

- Library: `libraryStudy.ts:studyDefaults` is the approved recipe; URL values are comparison overrides, not a user's product preferences.
- Session: `SessionVariations.tsx:sessionStyleDefaults` selects adaptive 46/28px buttons, tonal ink, left marker, auto columns and reading definitions.
- Builder disclosure and morphology choices must be recorded alongside these in the final handoff; do not infer approval from a transient browser URL/local setting.
- Preserve shared article presentation across Library and training word-details panels. Theme and text sizing must reach dialogs/portals too.
- Document visual controls separately from learning choices such as source, exercise type and direction.

## Checks still needed before accepting the production migration

1. Trace every visible setting: UI control → preference owner → persistence → all consumers; refresh and cross-screen checks. No changed switch without an effect.
2. Real-data state matrix: empty/loading/error, unavailable source, long word, missing article/forms/translation, many senses, large source list. No empty disclosure or inaccessible footer.
3. Accessibility/layout matrix: browser zoom 200%, text-spacing overrides, short landscape, largest text, long localized controls; keyboard/focus/Escape and reduced motion. Existing 320/430px checks do not replace these.
4. Six palette/mode combinations, default and maximum text size, actual normal/hover/focus/selected states. Reuse existing contrast tests and screenshot baseline.
5. End-to-end production slice: start → reveal → grade → next → exit → resume → history; then known/excluded/undo/report. Verify real persistence and failure recovery against current contracts.
6. Local DB contract/index warnings must be resolved or explicitly separated from UI outcomes before live-data sign-off. See existing DB debt notes; do not mask errors with demo data.

## Agent handoff package

Supply approved recipe, current reference screenshots, shared-component map, this wiring matrix, production owner/API mapping, and acceptance scenarios. Require staged integration, beginning with one real training flow and the shared Library article. Keep prototype reachable for comparison. A visual match alone is not completion; no scheduler/auth/data-model redesign is authorized by this handoff.

The earlier pending presentation fixes and staged localization are committed checkpoints; freeze the final exact clean commit before dispatching implementation work. No new task or external messages were created by this review.

## Owner clarification and proposed operating sequence — 2026-09-29

Confirmed by owner: Variations remain development-only, retained in the prototype for future comparison. They are not production settings. Local fixture behavior is expected in this prototype; lack of backend wiring is an integration task, not a reason to build a second backend-connected prototype.

Verified in production source:
- `lib/onboardingI18n.ts` loads EN/NL/RU JSON catalogs; `lib/platform/platformV2ClientI18n.ts` resolves messages and substitutes variables. Top-level nested string-leaf inventory (excluding arrays): 149 keys per locale, none missing relative to English. This does not establish UI coverage or translation quality.
- Other UI copy is distributed in component-local maps, e.g. `components/navigation/SettingsDestination.tsx` and `components/training/trainingHotkeys.ts`. The prototype contains inline English strings.
- `lib/training/useTrainingTranslation.ts` forwards selected `translationLang` as `targetLanguageCode`, and handles Off; `lib/translation/openaiTranslationContract.ts` places target language/code in the provider payload. `lib/training/sentenceExerciseLoader.ts` also uses the requested translation language when resolving/preparing sentence content. Reuse these paths; do not duplicate them in the prototype.

Recommended sequence, pending remaining product decisions:
1. Freeze the approved visual recipe and checkpoint; preserve prototype and its experiments.
2. Consolidate UI message ownership: feature namespaces, typed keys/parameters, explicit plural/date/number formatting, missing-key and interpolation checks. Keep dictionary content and AI translations separate from UI messages. Reuse/migrate existing catalogs instead of creating parallel translations. Development exposes missing keys; production uses an agreed fallback rather than displaying raw keys.
3. Introduce approved shared presentation on production flows behind a reversible rollout switch. Keep existing preference, translation, scheduling and action owners. No new business semantics inferred from fixture code.
4. Integrate a complete training path first, including its full-word panel and history. Reuse the same article renderer for Library next; connect builder/overview and remaining settings/statistics incrementally. Dependencies can be extracted first without replacing whole routes.
5. Validate each slice against real data, errors and persisted state; then owner browser review and rollout. Do not hide failed backend calls behind sample data.

Possible independent preparation blocks: message catalog/copy inventory, production adapter/contract map, visual acceptance fixtures. Keep shared component implementation coordinated; do not have parallel agents rewrite the same renderer. No additional agents or tasks dispatched in this turn.

First open product decision: required interface locales for the initial rollout (recommended EN/NL/RU). Subsequent decisions should be asked individually: unfinished-session behavior on preference changes, source pause/disable semantics, and rollout acceptance. These questions must first be checked against current product behavior/contracts.

## Locale decision and localization timing — owner review

Owner confirmed EN, NL and RU as mandatory interface locales for initial rollout.

Recommended sequencing clarification: inventory the approved prototype's user-facing strings and prepare EN/NL/RU catalogs before screen migration. Reuse existing keys when meaning and context match; add feature-scoped keys for new behavior. Localize extracted shared components before or while integrating each screen, then verify that production screen in all three locales. Localization is a per-screen acceptance requirement, not a post-rollout cleanup task.

Scope includes visible copy, accessibility names, errors, loading/empty states, counts/plurals, confirmation dialogs and notices. Prototype-only Variations/debug controls are excluded from production localization scope. Do not translate dictionary content through UI catalogs. Final wording/layout may be adjusted during integration; missing-key/placeholder checks and long-text browser checks remain required.

First localization slice: see `docs/exec-plans/407-ui-copy-inventory.md`. Navigation and the shared Training overview now use `ui.navigation` / `ui.trainingOverview` in the existing EN/NL/RU catalogs; the prototype's language selector previews that slice. The remaining surface matrix tracks copy to migrate screen by screen.

## Verified production seams for the first real Training slice

| Approved presentation | Current production owner | Integration rule |
| --- | --- | --- |
| Training landing / saved setups | `components/training/pilot/TrainingTodaySetup.tsx`; `trainingSetupPresets.ts` stores presets per user and learning language in browser `localStorage` | Adapt its real readiness and source eligibility states into the shared overview. Main-training selection and cross-device persistence are not present in this storage contract; decide and implement that contract explicitly before treating the prototype's main card as durable. |
| Session shell, position and progress | `TrainingScreen.tsx` chooses the active exercise family; `v2/TrainingSessionChrome.tsx`, `TrainingSessionV2Layout.tsx`, `useTrainingSessionPresentation.ts` consume the authoritative plan | Replace presentation inside this seam. Keep `TrainingScreen` ownership of session identity, loading/failure, exit/resume and action sequencing. |
| Word card and full-word panel | `v2/TrainingSenseCardV2Session.tsx`; `TrainingMoreSenseCardV2Session` within `TrainingScreen`; `library-v2/LibrarySenseCardV2Session.tsx` | Extract one article renderer used by Library and the training details panel. Preserve the existing lookup, access and list-action ports; do not add a second fixture-backed article model to production. |
| Grading, exclusions, history | `useTrainingTurnController.ts`, `v2/useTrainingExclusion.ts`, `navigation/TrainingHistoryDestination.tsx` | Retain server-accepted progress/action identity and the existing history source. Prototype `RecentActivity` is only visual evidence. |
| Preferences and translation | `lib/training/useTrainingPreferences.ts`, `SettingsDestination.tsx`, `lib/training/useTrainingTranslation.ts` | Bind approved theme/text/locale choices to the real preference owner and existing translation target. No prototype-local setting should become a competing production source of truth. |

The first production change should be a thin adapter and one complete meaning-card Training path, including loading, unavailable and resume states, with a reversible rollout switch. Preset persistence and main-training selection need a separate explicit product/data contract. Confirm actual behavior with signed-in local QA before changing the current session controller.

## First production presentation slice — 2026-09-29

The meaning-card session now has an opt-in `NEXT_PUBLIC_TRAINING_PRESENTATION_V1` rollout, off in the pilot profile until visual review. It keeps the existing Platform V2 lookup, session plan, action callbacks, history and close behavior. When enabled, its progress header is frameless, the duplicate daily-count footer is hidden, and rating buttons use the approved colored left edge and text: two compact rows on narrow screens, one 46px row on wider screens. The card remains height-constrained, with the metadata/headword and actions outside its scrolling answer region. Set the flag to `true` for local review; set it back to `false` for an immediate presentation rollback. This switch is independent of the Platform V2 training/data rollout and does not alter idiom or sentence exercises.

This is a first visual slice, not acceptance of the entire prototype. The Library article renderer, full-word panel, history styling, training overview, settings and remaining locale copy still need staged integration. Local QA health currently reports the platform RPC as ready but the DB deployment ledger and grouped dictionary search index as warnings; do not sign off real-data browser behavior until that environment is repaired.

## Prototype localization complete — 2026-09-30

Training overview, Builder, Settings, Training session/history, shared Library article/actions/forms/collections and Statistics now consume the existing EN/NL/RU catalogs. See `407-ui-copy-inventory.md` for scope and validation evidence. Development-only Variations/inspectors and fixture switches remain separate. Locale switches preserve canonical selection/action values and local preview state; translated display labels must never become backend IDs.

The next implementation slice remains the shared article/full-word presentation inside the existing production Training/Library seams. Reuse the already prepared catalogs and theme/text tokens, bind the production locale/preference owner, and keep its lookup and actions authoritative. Do not copy Statistics fixture formulas, training-name callbacks, sample history, or demo notes into production telemetry. Real Statistics loading/error/empty states must come from its actual data adapter.

Before rollout, the earlier acceptance gates still apply: DB/index readiness, real persistence/failure recovery, browser zoom/text spacing, landscape, keyboard/focus/reduced motion and palette contrast. Localization fixture checks do not close these gates.

## Shared article presentation checkpoint — 2026-09-30

`components/practice/article/ArticleContent.tsx` owns normalized article rendering and `articleContent.module.css` owns the reading styles. The prototype composes these same styles; production Training and Library consume the same renderer through `ProductionArticleReading`. Lookup, learning actions, collections, translation requests and scheduling remain in their existing controllers. Source/translation language tags and EN/NL/RU interface labels are independent. No fixture data enters production.

`NEXT_PUBLIC_SHARED_ARTICLE_PRESENTATION_V1` is an independent explicit opt-in, default off. Local review enables it together with the earlier Training presentation switch; either switch can be rolled back independently. Production mode follows the existing app dark class. Text sizing bridges the current three-value reading preference (definition 20px at normal, 25px at largest); migration to four shared steps and the palette preference owner are subsequent tasks, not silently introduced persistence contracts.

Validated: typecheck, practice style guard, 166 tests in 13 suites, 12 existing full-word-panel browser cases and 12 Training reading browser cases across short/narrow/wide screens, normal/largest reading and light/dark. The largest-text Russian prototype Library follow-up also passed. These browser cases use controlled lookup fixtures and establish presentation/controller compatibility, not live-data acceptance. Existing Training audio effect dependency lint warning remains; local DB ledger/index warnings remain open.

Next: bring the pinned word header and real additional word details into this shared presentation, then integrate preference/theme ownership and the remaining screens in order. The rollout remains off by default until owner review and the earlier real-data acceptance gates are satisfied.

## Shared forms and relations checkpoint — 2026-09-30

`ArticleWordDetails` now owns the approved editorial forms row, single disclosure/table and meaning-scoped relation blocks; the prototype uses only a fixture adapter. Production Library/full-word panels receive `wordDetails` from the existing Platform V2 entry model. Training answers receive entry relations through the existing exercise presentation model. No database/API contract changes or new raw parsing were introduced.

The public semantic-form adapter uses canonical form/feature values independently of translated labels. Principal forms are combined and perfect is not repeated; conjugation-only verbs have a nonempty preview. Other parts of speech fall back to the first available form, with additional forms behind one disclosure; an absent forms record produces no empty row. Unknown form/tense text remains available. Forms common to every meaning appear under the headword; missing/differing forms stay attached to the meaning. Relations are always meaning-scoped and independent of translation toggles, including entries without forms.

Validation: typecheck, targeted lint/style guard; 116 tests in seven suites, followed by 25 tests after the final compact-fallback adjustment. Twelve existing large-text full-word-panel browser cases plus six new forms/relations cases at 320/430/1440px in light/dark passed. New screenshot fixtures intentionally exercise the controller with controlled form/relation payloads; they are not live dictionary acceptance. The existing rollout gate remains default off. Additional grammar/usage/pronunciation notes and references, production palette/text preference integration and the remaining screen adapters are still pending.

Open product decision before saved-training integration: whether presets/main-training selection move from browser-local storage into the account for cross-device synchronization. Owner was asked with account synchronization recommended; no new persistence contract has been assumed.
