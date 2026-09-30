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

## Account persistence decision and local environment — 2026-09-30

Owner confirmed server/account storage for saved trainings and main-training selection; browser import/restoration was subsequently explicitly declined; server storage is the only authority. Implement explicit typed account settings, preserve canonical language/source/exercise IDs, isolate updates from unrelated preferences and surface concurrent edits rather than overwriting another device.

At owner direction, the reviewed `codex/397-bulk-import` branch (047998b3) was integrated in merge 130c3764. The canonical local DB was recreated with that branch's wrapper, imported 18,163 artifacts, built 68,102 form rows and completed search backfill (18,163 documents / 161,795 fields). The managed gate applied/checksummed migrations through 178 and passed its bounded QA read in 1,404ms. Deep health reports `ok`, local target and matching `2000nl-db-178`. A retaining `check` exposed a harness regression: chained behavioral postflights 177–178 try writes under read-only sessions. A separate checksum-pinned schema/privilege probe now preserves the read-only check; deployment behavior probes remain unchanged.

Live Library search uncovered a separate environment/contract failure after that import: `huis` returned `lookup_failed`; direct `lookup_platform_v2_entries` failed with `function digest(text, unknown) does not exist`. Local Supabase installs `pgcrypto` in `extensions`, while the legacy lookup base has `search_path=public,private,pg_temp`. Plain-Postgres CI already supplies public digest adapters, masking this discrepancy. Migration 179 adds the same schema-qualified, immutable adapters when absent, leaves public pgcrypto installations and existing functions intact, and does not change RPC bodies, grants or scheduling. Disposable tests reproduce the failure before migration and verify both namespace layouts, text/bytea parity and idempotence afterward. External audio/translation providers remain separately unconfigured in local QA; their failed requests do not establish an article rendering failure.

The managed replay then exposed a gate defect, not a new migration failure: include expansion removed `BEGIN`/`COMMIT` from chained postflights but retained `ROLLBACK`. Behavioral postflight 177 therefore left three fixture entries committed and repeated runs hit its fixed source keys. The gate now preserves all included transaction boundaries. A regression check pins the rollback block; the three local entries were removed only after verifying their exact probe actor/identity and absence of learner state/session membership. Existing immutable migrations and postflight files were not rewritten.

Final environment validation: retaining readiness passes, managed contract 179 passes twice (bounded reads 1,411ms / 1,418ms), no postflight entries remain, deep health is `ok` with 18,163 search documents and 161,795 fields. Signed-in live Library search opens `huis` with actual article/forms/relations (`huizen`, `huisje`, `de woning`), visually checked in the browser. This closes the previously identified DB/index/lookup environment blockers, not the remaining full integration acceptance. While validating, main advanced to c6231f28 with #397 replay cleanup and CI updates; those were merged, preserving their cleanup and our transaction-boundary protection. Contract expectations/drift checks now target 179. Pending next: account-owned saved/main trainings, then production preference/screen integration.

## Account training setups storage boundary — 2026-09-30

Owner confirmed account/server persistence, one main training across the account, and explicitly declined browser import/restoration because there are no saved setups to recover. Do not implement import UI, receipts, cache recovery or automatic copying. A new account document starts empty.

Migration 180 adds bounded `training_setups` and `training_setups_revision` columns to the existing settings owner. It does not replace the generic preferences JSON, mutate learning preferences, or store card/progress state. The security-invoker save RPC derives the user from `auth.uid()`, uses existing own-row RLS, locks the one settings row and compares its revision. A stale write returns the current snapshot; it does not overwrite another device. The first-party-only `/api/training/setups` GET/PUT boundary validates canonical exercise/source/filter IDs, document limits and the main-training reference. It never accepts a client user ID and never uses service-role persistence. Saved configuration must still pass the existing source/access/readiness checks when starting a session.

The draft type and validation live in `lib/training/setups`, independent of the large builder component. Existing browser preset helpers are temporary compatibility code until the production overview/builder adapter is switched to the account port; they are not an import path. That UI hookup is the next slice. Prototype fixture state and Variations remain development-only.

Validated before UI hookup: 56 unit/component/contract checks, typecheck and targeted lint; a disposable DB test covers own-row isolation, unrelated preferences preservation, stale revision rejection, actual simultaneous device saves (one winner, one conflict), main-reference validation, execute privileges and idempotent DDL. Local Supabase's native backend crashed on a direct forbidden anon invocation during the first attempt; recovery completed. Anonymous access is therefore checked through catalog permissions and API denial rather than repeating that local-engine failure. The scoped failed-test DB was removed; no production target was used.

## Account training setups UI checkpoint — 2026-09-30

The production builder now loads and saves account-owned trainings through the typed client/hook, with loading, retry, failure and revision-conflict states in EN/NL/RU. Browser preset storage and its helper are removed; no migration or restoration path exists. Late responses from a previous account are ignored, duplicate writes are blocked, and stale edits do not recreate deleted trainings. Saved trainings retain their learning language. Main selection and confirmed deletion use shared controls also consumed by the prototype; removing the main training selects the next saved training, or clears it when none remain. Learning progress and unrelated preferences are untouched.

Browser acceptance on the local QA account covered creation, persistence after reload, main selection, deletion cancellation with focus returned to the initiating control, deletion and fallback main selection. Temporary trainings were deleted. A shared dialog focus-restoration bug was corrected: capture the opener before descendant autofocus runs. Account/controller checks passed (62 tests in seven suites), plus 26 shared presentation/theme/control checks, typecheck, targeted lint and the shared style guard. The contrast audit now evaluates individual selectors in grouped CSS rules; previously it incorrectly skipped the shared dark semantic inks. Thresholds and theme colours were preserved.

The existing production overview layout and quick-start configuration remain in place at this checkpoint. Next is the approved Training overview adapter with account main training and actual session data; this checkpoint does not claim that the new hero or all remaining prototype screens are integrated. Presentation rollout remains gated.

## Production Training overview checkpoint — 2026-09-30

With the existing Training presentation rollout enabled, the production setup controller now composes the approved shared Training overview. The adapter lives separately in `AccountTrainingOverview`; source/scenario availability moved into a small shared helper with unchanged characterization coverage. The overview consumes accepted account setups, one account-wide main selection and the existing controller's owned session identity/progress. It does not identify a session by preset name or draft equality, copy fixture statistics, or treat study-day totals as per-training activity. Unknown activity/pool counts are omitted. Unknown resumed totals remain unknown and do not produce a manufactured progress bar. Configured session size remains visible.

Launching or editing a saved training of another learning language waits for the existing language/catalog hydration; launch rechecks its source/scenario eligibility. Queued intentions are bound to the initiating account and cannot survive account changes or recreate deleted presets. Partial dictionary access stays disclosed without deleting references. Saved names are editable using shared EN/NL/RU labels; new names default to material instead of repeating all configuration in the hero heading. The default setup remains immediately launchable when no presets exist; create and edit remain direct actions.

Validated: typecheck, targeted lint, shared style guard and 63 focused tests covering the existing builder, new approved adapter path, account main launch, language hydration, cross-account cancellation, custom name persistence, partial source access, unknown metrics, catalog/plural rules and theme contrast. Live local QA checked create/save/rename, direct editing, launch through the existing finite-session controller, return/continue, server restoration after reload, and deletion of the temporary saved training. Desktop and 430px screenshots were inspected. No review/grade action was submitted; the resulting QA run remains resumable with zero completed actions. A development hot-reload dependency-array warning disappeared after a full reload and did not recur.

Remaining integration work includes the approved builder layout, app/mobile navigation, actual preference ownership for shared palette/four-step proportional text sizing, and remaining Settings/Statistics/history adapters. The overview cannot yet show reliable training-specific cumulative activity or matching meaning counts because the current accepted server ports do not provide those projections. Rollout stays opt-in; these omissions are not claimed complete.


## Production Builder presentation checkpoint — 2026-09-30

The gated production controller now composes `ApprovedTrainingBuilder`, retaining existing catalog hydration, scenario eligibility, canonical draft IDs and session-start ownership. Language, Source, Exercises, Filters and Session use the same shared expanding-frame component as the approved prototype variation. All sections begin collapsed on creation and reopening. Closed bodies are clipped and inert; the straight inner top corners and whole-frame hover are shared. Source and language choices expand inline; no prototype fixtures or Variations enter the production boundary.

POS chips retain canonical Dutch keys, with one anchored noun-article dialog and opener focus restoration. Existing size/balance controls retain all-due/review constraints and preserved saved values. Unavailable dictionaries stay disclosed rather than silently removed. New labels are in EN/NL/RU catalogs, including localized language search and review-ratio pluralization. Saving uses a shared name dialog, remains open on failure and clears stale feedback before opening. Switching accounts discards the prior owner's open editor/draft. There is no browser import, migration or restoration path.

Validation: 73 checks across six focused suites, typecheck, targeted lint and shared style guard pass. Live local browser acceptance covered desktop 1280x720 and mobile 430x932: all five sections collapsed, POS/noun article selection, account save/reopen/update, inline real dictionary selection and Session controls. Footer actions remain visible while builder content scrolls without a visible scrollbar. Save/update did not expand the optional activity disclosure on retest. The temporary QA training was deleted; no grade/review was submitted.

Direction previews currently express the actual prompt/answer roles and languages, rather than copying illustrative prototype dictionary examples. Rich real example previews remain pending. Also pending: shared account palette/four-step proportional typography preference ownership, app/mobile navigation and remaining Settings/Statistics/history adapters. The presentation flag remains opt-in; this checkpoint is not whole-product rollout acceptance.


## Shared account text scale checkpoint — 2026-09-30

The existing account reading-profile owner now accepts four sizes. Stored IDs remain `normal`, `large`, `largest`, with additive `extra`; the explicit presentation adapter maps them to `standard`, `larger`, `large`, `extra`. This avoids confusing the old account `large` with the prototype's larger `large`. Migration 181 widens only the two bounded constraints, preserves defaults/current data/RLS and has checksum-pinned forward/read-only probes. No browser copying or new preference authority is introduced.

In the approved rollout, one four-button strip controls the selected phone/computer profile. Sizes are account-owned; only the device-profile choice stays in the browser and does not change with viewport width. The scale is shared with the prototype: reading 100/125/150/200%, UI 100/115/130/150%, display/headword 100/108/118/130%. Existing training reading variables are adapted from the same scale; nested theme/article roots resolve inherited account aliases and cannot reset the selected size. The common navigation text also scales. The selected scale attribute activates the existing large-text reflow rules in Builder/overview.

Validation: 88 tests across eleven UI suites, typecheck, targeted lint and shared style guard; 43 harness/deploy gate tests and a disposable DB integration covering extra-size persistence, independent profiles, unrelated settings preservation, own-row RLS, invalid-value rejection and idempotent DDL. Live local QA saved maximum size, measured actual shared article tokens (definition 40px, literary 32px, UI 21px), and checked 430px Settings for horizontal overflow (430px content/viewport). The QA account's original normal size was restored. Retaining readiness passes contract 181 with 18,163 entries, 68,102 forms, 161,795 search fields, two learner states and zero review rows.

A separate harness defect discovered during application is fixed in 48c8764b: retaining `apply` now uses reviewed forward migrations instead of replaying historical bootstrap. Recovery and exact migration-120 failure are recorded in the local Supabase runbook. Comparing canonical clean-bootstrap function bodies afterward leaves only the intentional pgcrypto namespace difference and no retired scheduler signatures.

This checkpoint connects typography ownership and inheritance, not every remaining screen layout. Legacy Library search/list chrome, Settings sections and history still need their approved adapters; their fixed sizes are known outliers. The existing narrow desktop Library article panel becomes cramped at extra size and must be replaced by the agreed responsive presentation, not treated as final acceptance. Account palette persistence, approved app/mobile navigation and remaining Settings/Statistics/history integration remain pending. Rollout is opt-in.

## Account palette checkpoint — 2026-09-30

The opt-in production presentation now saves Lavender/Blue/Graphite in the existing account `user_settings` row. Migration 182 adds one bounded non-null column with Lavender default and retains existing own-row policies. The repository writes only that column and user identity, preserving text profiles, theme mode, training setups and unrelated preferences. Browser restoration/import remains intentionally absent.

The new appearance panel shares the existing EN/NL/RU catalogs and proportional text controls. Palette ownership is separate from the existing theme-mode and reading-profile owners; nested approved article, builder and settings roots inherit account colours. AppFrame surface/ink roles consume the same semantic tokens, while flag-off fallback styling is retained. A system-theme defect is fixed: OS media events now respect the mounted account controller's explicit Light/Dark choice, with system fallback restored when it unmounts. Obsolete debug-only theme instrumentation was removed.

Validation: 27 focused UI checks (provider account isolation, loading/saving errors and retries, duplicate-save prevention, bounded requests, partial writes, theme resolution, existing settings and six-palette AA contrast), typecheck, targeted lint and shared-style guard. All 43 local harness/deploy checks pass. A disposable SQL integration verifies persistence, unrelated settings preservation, own-row RLS, invalid palette rejection and idempotent migration. Retaining local apply passes contract 182 and the bounded read probe (1,418ms). Browser QA confirms Blue and Graphite in both modes have identical canvas tokens at every nested approved root; Blue/Dark survives a full reload. Original QA Lavender/System/normal settings were restored; no learning action was submitted.

Remaining: legacy Settings language/account/shortcut panels and navigation accents still use their old styling, and the approved Library/Statistics/history adapters are pending. This checkpoint is account palette ownership/inheritance, not full-screen visual rollout acceptance. Production deployment remains unperformed.
