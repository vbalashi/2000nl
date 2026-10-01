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

## Shared Settings presentation checkpoint — 2026-09-30

The approved rollout now uses the same `SettingsLayout`, flat section/row hierarchy, segmented choices and palette cards as the prototype. Desktop has a sticky section menu and bounded content column; mobile opens the section list, focuses the selected section heading and restores opener focus on return. Reopening Settings returns mobile navigation to its list. The production exit action returns to Training. Legacy presentation remains flag-off; no prototype fixtures or Variations are imported.

Languages, Appearance, Shortcuts and Account now consume the existing EN/NL/RU catalog and shared theme/text roles. Theme mode, text profiles, locale, translation target and sign-out still use the existing production owners. A previously selected translation language outside EN/NL/RU is retained and displayed rather than silently cleared by the selector. Appearance controls and palette previews are shared with the prototype; palette cards reflow according to the chosen font size. Duplicate navigation/panel/row/palette CSS was removed from the prototype. No new preference storage or DB changes are introduced here.

Validation: 35 focused checks across six suites cover production callback routing, retained translation codes, localized accessibility labels, mobile return/exit/focus, reopening, text-profile preservation, existing legacy surfaces and all palette contrast roles. Typecheck, targeted lint, shared style guard and diff checks pass. Browser QA covered desktop 1280px, mobile 430px and 320px, maximum text size, EN/NL/RU locale changes and both prototype/production Settings. A 320px truncated System label was found and fixed; after the fix, visible controls and the page have no horizontal overflow. Shared section navigation measures the same 12px Inter family in both consumers at Normal. QA locale RU, Normal text, Lavender/System and ordinary viewport were restored; temporary tabs were closed and no learning action was submitted.

This completes the existing Settings surface's presentation adapter, not the whole Settings feature set. Account learning-language ordering/pausing, dictionary enablement, an arbitrary-language translation picker and real billing data remain pending integration; illustrative prototype records must not become production controls without their real contracts. Existing general preference write-error handling also still needs maturation. Approved app/mobile navigation, Library/Statistics/history and active-session chrome remain pending. Rollout remains opt-in and production has not been deployed.

## Translation-language picker and material pause decision — 2026-09-30

The approved account Settings now opens the shared searchable language picker instead of a three-language translation dropdown. Its existing bundled ISO catalog is shared with the prototype; the production picker/catalog chunk loads on demand with localized loading feedback. Search supports ISO aliases, native names and EN/NL/RU labels, while account persistence always uses the canonical code. The prototype retains its existing illustrative name values through a narrow adapter. The picker owns no preference state; selection continues through the existing production callback/repository. Search receives focus after native modal opening and closing restores opener focus. Shared text/colour roles and bounded internal scrolling apply to both consumers.

An existing persistence defect is fixed: explicit translation Off writes the established `off` sentinel; SQL NULL continues to mean the legacy/unset English default on reads. No migration or learning-state change is needed. Partial writes preserve the user's learning scope and other settings. This checkpoint does not resolve the existing general preference save-error handling, nor promise equal translation-provider quality for every catalog language.

Validation: 36 tests across four suites cover canonical code selection, callback routing/focus, ISO/localized/native search, catalog identity uniqueness, locale catalogs, preference defaults and Off/code partial writes without learning RPCs. Typecheck, targeted lint and shared style guard pass. Browser QA verifies Polish and Off survive full reload, and the picker fits 320px without horizontal overflow (320px document, 286px dialog). Original QA English translation and RU interface were restored; no translation-provider request or learning action was submitted.

The user's material policy is now accepted and recorded in [the decision record](../discussions/2026-09-30-02-paused-training-material.md): paused learning languages/disabled dictionaries prevent new launches and material selection; an already-started training can resume/finish. This is not an entitlement override and does not erase history/progress or saved training configurations. The account material-preference contract and server launch/resume enforcement are the next integration stage; these controls are not yet exposed as functioning production settings. Other Library/Statistics/history/mobile navigation and active-session presentation adapters remain pending. Rollout remains opt-in; production is not deployed.

## Account material-preference contract checkpoint — 2026-09-30

Migration 183 adds a versioned material document and revision to the existing account settings row, reusing own-row RLS. It stores ordered learning languages/pause flags and disabled dictionary IDs independently of appearance, saved trainings, current sessions, progress and dictionary ACLs. Both DB constraints and the client model validate shape, identity, duplicates and bounds. Empty language order retains the legacy implicit catalog; an explicit list retains one active language, as in the approved prototype. ISO language selection does not invent content or entitlement.

The authenticated security-invoker save RPC derives the principal from `auth.uid()`, serializes account writes and returns the current snapshot on stale revision. The server repository uses a request-bound authenticated client; the new first-party-only `/api/settings/material` route derives account identity from its authenticated principal. Browser requests capture the expected account token, so account switching cannot retarget a save. Authenticated request transport and bounded JSON body parsing are shared with the existing saved-training endpoint; its characterization checks retain response shapes and errors. Requests expose errors/conflicts rather than fictional success and introduce no browser migration. Ownership and the next launch/resume boundary are recorded in [ADR-0017](../adr/0017-account-material-preferences.md).

Validation: 35 checks across six model/client/API/body-reader and existing saved-training characterization suites, typecheck and targeted lint; 43 local harness/deploy checks. A disposable SQL integration checks own-row isolation, two concurrent devices (one save and one conflict with the winner's snapshot), stale revision, partial preference preservation, invalid direct writes, anonymous denial, idempotent DDL and an existing session row preserved byte-for-byte. This establishes storage behavior, not a completed pause/resume workflow. Migration 183 and its read-only probe are checksum-pinned in the reviewed forward manifest. Retaining local application passes contract 183 and the bounded read probe (1,434ms); the full local read-only check retains 18,163 entries, 68,102 forms, 161,795 search fields, two learner states and zero review rows.

Pending next: server planning/new-start enforcement with frozen material selection for existing runs; account Settings controls and updated Training/Library material selectors. Existing all-readable catalog RPCs must remain available to resume and Settings. No pause/toggle production control is exposed yet. The rest of the approved Library/Statistics/history/navigation and active-session adapters remain pending. Rollout remains opt-in; production deployment is unperformed.

## New-run material policy checkpoint — 2026-09-30

Migration 184 applies the accepted pause rule at the existing server plan/start
boundary. Plans and fresh starts resolve current account material preferences;
a caller-supplied older snapshot is replaced. Sessions save the resulting
selection in their existing filter. The ordinary scheduler, idiom/translation
source relations and member replacement use the saved snapshot rather than
current preferences. Pausing a language or disabling a dictionary does not
rewrite members, learning state, saved setups or existing receipts. Existing
sessions without snapshots retain their old scope. Dictionary access checks
remain live and cannot be bypassed by the snapshot.

The receipt check precedes material resolution for every current start family,
including cached v1 calls. Compatibility candidate variants preserve legacy
global scope, ranking, pair exclusion and source binding; material filtering
occurs before offset/limit. Guarded edits use latest installed definitions and
compile related CTE changes atomically. Existing all-readable catalog RPCs are
unchanged for Settings and resume validation. The checksum-pinned forward/read
contract advances to 184; production deployment remains unperformed.

Validation covers idempotent DDL, current-policy plans, forged snapshots,
mixed-language collection filtering, both extra-exercise families and cached
starts/retries, unchanged existing members, resume, replacement after pause,
private-list isolation, disabled dictionary rejection, independent access
revocation and absence of learning action events. The existing exact-filter
characterization now includes the additive server-authored material snapshot.
Validation passes 259 scheduler/FSRS checks across 24 suites, 43 harness/deploy
checks, disposable material integration, typecheck and targeted lint. Retaining
local apply passes contract 184 and its bounded read probe (1,469ms); read-only
verification retains 18,163 entries, 161,795 search fields, two learner states
and zero review rows. Account Settings controls, selector adapters and the
remaining approved screens/presentation are still pending; rollout is opt-in.

## Account material Settings checkpoint — 2026-09-30

The opt-in approved Settings surface now edits account-owned learning-language
order/pause and dictionary enablement. A keyed account provider owns the accepted
server snapshot and revision; it has no browser persistence or migration. Changes
are non-optimistic, duplicate writes are guarded, stale/account-switched responses
are ignored, and a conflict adopts the server winner without replaying the user's
outdated change. Loading, save failure and catalog failure have distinct localized
feedback. Focus/visibility refresh retrieves changes made on another device.

The shared searchable picker adds canonical ISO learning-language codes, including
languages without content, and uses a learning-specific footer. The last active
language cannot be paused. Dictionary Settings uses the real authenticated readable
catalog and entry counts; personal dictionaries remain enabled. Empty inventory is
not substituted for a failed request. Existing all-readable catalog callers retain
their behavior through a strict, abortable adapter rather than a global filter.
Controls reuse Settings layout, text/colour roles, and EN/NL/RU messages. Pending
writes preserve opener/control focus instead of disabling the focused element.

Validation covers implicit catalog editing, canonical additions, ordering, last
active protection, non-optimistic saves, duplicate prevention, conflict adoption,
errors/retry, account switching, stale reads, real dictionary identity, personal
inventory, modal focus and three interface locales. Typecheck, targeted lint and
shared style guard pass. Browser QA verifies pause persistence after reload,
dictionary switching and 320px layout with the largest account text profile
(document width remains 320px). QA material preferences and text size were restored
through their existing owners; no learning action or translation request was sent.

This completes these Settings controls, not the full integration. Training/Library
new-material selector adapters are next; existing-session resume must continue to
use the readable catalog and the frozen server snapshot. Other approved screens,
billing/general preference error handling and active-session presentation remain
pending. Rollout remains opt-in; production deployment is unperformed.

## Training new-material selector checkpoint — 2026-09-30

The approved Training setup now consumes the account material provider through a
small new-run adapter. Language choices follow active account order and use the
shared localized language names. Source choices exclude disabled dictionary IDs.
The current paused language cannot launch a fresh run; the constructor can switch
to an active language. Failed/pending material reads block fresh launches and have
localized feedback/retry, without hiding the independent owned-session continue
control. Paused/disabled saved setups remain stored and editable; no automatic
language switch or scope write occurs when account preferences change.

The readable Training catalog and controller/resume scope are unchanged. The new
adapter applies only to overview launch and constructor selection, and the server
still resolves actual collection contents, mixed-language scope and new-run
availability. Collection membership cannot be inferred from dictionary options;
its authoritative eligibility remains the server policy/plan boundary. Library
search selection is not yet adapted and is the next stage, including preserving
pagination/count accuracy instead of removing individual results after retrieval.

Validation passes the 39 Training setup tests (including paused language, disabled
source, preserved saved setup, read failure/retry and independent resume), 13
account-material tests and the 70 existing TrainingScreen characterizations.
Typecheck and targeted lint pass. Browser QA confirms a disabled real VanDale
source is absent from fresh-run dictionary choices, with save/start unavailable
when no source is selected. Test account preferences were restored; no run or
learning action was created. Production rollout remains opt-in and unperformed.

## Library search material boundary checkpoint — 2026-09-30

The current Library hook filters a selected dictionary after receiving an ordinary
V2 lookup page. This can hide all groups on a page while its cursor still points
into the unfiltered corpus. Migration 185 establishes the server boundary needed
to remove that behavior: a service-only first-party Library lookup resolves current
account material settings and an explicit dictionary scope before candidate tiers,
ranking and group-atomic pagination. Personal dictionaries remain enabled; dictionary
ACLs and entitlements remain live. The scope is part of the opaque cursor identity,
with canonical explicit ID sets, so a cursor cannot cross dictionary selection or
changed material preferences.

The latest installed private lookup implementation is reused through a guarded
scoped variant, preserving its existing group bounds, source identity, ranking,
form fallback and access rules. Ordinary Platform lookup, external clients, exact
full-word reads and training group reads are unchanged. The helper is not granted
to client roles; only the server role can call the public scoped adapter. Its user
ID must be derived from the authenticated first-party request in the next stage.
No learner state, session or action is created by search.

Validation: a disposable integration applies migration 185 twice and tests filtering
before the page, canonical ID sets across pages, invalid cross-scope/stale cursors,
paused languages, disabled sources, personal-dictionary retention, private access,
access revocation, form fallback after excluding another source's headword tier,
unchanged ordinary lookup and absence of learning state/history/session mutations.
The read-only postflight pins grants, server account resolution, scope-before-ranking,
identity projection and cursor boundaries. All 259 existing FSRS/scheduler checks
and 43 local deploy/harness checks pass. The checksum-pinned contract advances to
185; retaining local apply passes its bounded probe in 1,523ms. Read-only local
verification passes without resetting/importing the database.

This is the server foundation, not completed Library UI integration. Next, route
first-party Library search through this boundary and consume scoped pages directly;
connect active-language/source selectors without filtering retrieved groups. The
approved Library visual adapter, other screens and active-session presentation
remain pending. Production is not deployed.


## Library scoped query integration checkpoint — 2026-09-30

Approved-presentation Library dictionary searches now call a first-party API adapter
for migration 185. The adapter derives the principal from authenticated server
context, validates bounded query/dictionary inputs, and reuses the existing V2
projection. Exact full-word reads, connected-client lookup and owned-collection
browsing retain their existing readable boundaries. No browser user ID is trusted.

Library language/source controls consume the account material provider and strict
readable dictionary inventory. Paused languages and disabled sources are absent
from new search choices. A paused local search language switches to the first
active language without modifying account settings or an existing training run.
Pending/failed material reads block new dictionary queries and expose retry.
Server-scoped groups are consumed directly, preserving group-atomic pagination;
legacy presentation remains compatible. Scope/revision changes reset the first
page, and an invalid stale non-first-page cursor triggers one fresh first-page
request. Open articles and collection membership are not rewritten by search.

Validation: 86 tests across seven suites pass, covering first-party principal
ownership, connected-client rejection, input/body bounds, ordinary lookup
compatibility, scoped transport, source/language selection, pagination and stale
cursor recovery. Typecheck, targeted lint, shared style guard and diff checks pass.
Browser QA against the real local database searches `goed` and switches from all
sources to VanDale Dutch, displaying its three headword groups and the shared
article. No account preference, learner state, session or grading action was
changed by this QA. Screenshot: `/tmp/407-library-scoped-search.png`.

This completes search/material plumbing, not the approved Library shell. The
legacy search layout and its remaining copy must still move to the approved
Library presentation and EN/NL/RU catalogs. Statistics/history/mobile navigation,
general preference and billing error states, and final active-session acceptance
remain pending. Production rollout remains opt-in and unperformed.


## Shared Library results and copy checkpoint — 2026-09-30

`components/practice/library/LibraryResultList` owns the approved compact word
rows and list surface. Production grouped Library and the prototype now use this
one renderer: shared reading/UI fonts, WordIdentity article treatment, POS colours,
core-vocabulary indicators and localized sense counts. Prototype-only density,
listing/count placement and double-click experiments remain explicit presentation
props. Obsolete row/list rules were removed from the prototype stylesheet.
Production retains exact group identity, homograph numbers, dictionary ownership,
selection and ordering. Multiple-source pages keep source names visible, including
at narrow widths; source labels are user/provider content and are not translated.

The approved Library workspace drops the extra heading and outer search frame;
its rows, search field, scope controls and pagination consume shared semantic
fonts/colours. The actual article, forms, relations and actions retain their
existing production adapters. Search/custom-entry UI labels, validation, errors,
empty states, navigation and page/group counts use the existing EN/NL/RU catalogs.
Changing interface locale preserves query and selected entry. The placeholder
now promises word search, matching the current headword/form lookup boundary.

Validation: 93 tests in six suites pass, including the existing 70 TrainingScreen
characterizations, grouped pagination/state and locale switching, shared-row
article/content-language and select/expand intents, and catalog/parameter/plural
parity. A subsequent 22-test focused regression passes after indicator/source and
CSS cleanup. Typecheck, targeted lint, shared style guard and diff checks pass.
Browser QA verifies the reference prototype and real local `goed` groups/article,
320px layout, mobile article selection, and the largest account reading profile.
At 320px the document width remains 320px; overflowing rows scroll within the
list and pagination stays outside it. The pre-existing Increased desktop profile
was restored after QA; no learning action or material preference was changed.
Screenshot: `/tmp/407-library-shared-list.png`.

Library migration is still incomplete: extract/connect the approved filter dialog
with server POS/article filtering before pagination; replace the temporary inline
Language/Source selects; adapt owned-collection rows and entry-editor layout for
short/large-text screens. The inherited personal-entry translation editor still
hardcodes EN and needs an explicit language-owner binding; this checkpoint does
not claim it is resolved. Remaining Statistics/history/mobile navigation and
active-session acceptance gates are unchanged. Production is not deployed.

## Library POS/article query foundation — 2026-09-30

Migration 186 adds a separate service-only filtered Library RPC. It validates ten
canonical POS choices and optional noun article, applies predicates before lookup
tiers and paging, retains whole-article identity and live material/ACL constraints,
and returns the total matching article count independently of page size. Removing
an exact headword via a POS filter permits an eligible inflection match; noun
article selection retains other selected parts of speech. Both-article genders
match either choice; unknown gender does not satisfy a selected article. Canonical
filter sets bind cursor identity. Existing Library/Platform/exact read behavior is
unchanged and no learning state is created by search.

Validation: a disposable Postgres integration fixture exercises mixed-sense article
preservation, pre-page counts, cursor canonicalization and scope rejection, article
and unknown-gender cases, form-tier fallback, personal entries without search
index, all ten POS aliases, malformed filter rejection and no learner writes.
The migration is replayed twice; the previous material-scope fixture and read-only
postflight also pass. All 259 FSRS/security/learning checks and 43 deployment/local
harness tests pass. Retaining apply installed contract 186 in the populated local
QA database; its bounded read probe passed in 1492 ms against the 2000 ms budget.
Read-only real-corpus `goed` queries returned three matching articles without POS
restriction, one noun article, one adjective article and no `de` noun article;
whole-article sense counts remained intact. No account preference or learning
action was changed.

This is the query foundation, not completed Library filters. Next connect the
first-party API/client to these validated filters and extract the approved chips
panel with real language/source options, draft/cancel/apply behavior and matching
sense selection. Remaining collection/editor, Statistics/history/mobile navigation
and active-session acceptance gates remain open. Production is not deployed.

## Library filter API/client checkpoint — 2026-09-30

The first-party search route accepts a closed canonical `filters` object with ten
POS choices and optional noun article. Invalid shapes stop before service-role
lookup. Filtered requests opt into migration 186; missing filters retain the
existing migration-185 boundary. Ordinary external and exact-group reads remain
unchanged. The response adds first-party-only `librarySearch` metadata: exact
matching-article count and matching entry identities derived from the same raw
POS/article evidence. The main V2 projection and full article are reused without
removing senses or cross-references.

Transport validates count/match metadata against the returned group identities
and rejects missing/malformed filtered contracts. Search state can carry filters;
they bind its query/cursor scope. Filter changes start from the first page; late
responses cannot replace the current search. Results choose a matching sense for
opening and keep the complete article. Total groups are independent of page size.

Validation: 73 targeted route, service-boundary, client/transport, filter-predicate,
group-search and Library grouping characterizations pass. A real authenticated
HTTP smoke uses the local dev-only QA session helper with no persisted token and
no learning action. `goed` returns three articles/twelve entries with no POS
restriction, one noun article/four entries, one adjective article/six entries and
zero noun/de articles. Typecheck, targeted lint and shared style guard pass.

The UI panel remains pending: replace inline Language/Source controls with the
shared approved chips dialog, real catalogue options and draft/cancel/apply/count
preview. The existing grouped-result adapter ignores cross-reference-only groups;
its row/opening presentation must also be reconciled so the exact article count
and visible articles agree. This is not a completed Library acceptance gate.
Collection/editor, Statistics/history/mobile navigation and active-session work
remain open. Production is not deployed.

## Shared Library filters UI checkpoint — 2026-09-30

Approved Library search now opens the shared chips dialog. Language and Source use
real account/catalogue identities; drafts remain private until Apply, Cancel
restores focus without changing the query, and Apply resets paging atomically.
The noun chevron opens the nearby article picker. A debounced, abortable read
previews the server's matching-article total; failures remain explicit and
retryable, with no fabricated counts or learner writes. Paused languages and
disabled dictionaries are excluded from new material selection. The started-run
policy remains unchanged: frozen material can be resumed/finished, subject to live
ACLs; disabling material affects new launches, not historical progress.

The prototype and production UI share the filter dialog, noun popover and semantic
styles. Prototype alternative layouts and fixture counts stay in dev wrappers.
Builder's inline material picker reuses the extracted styles. Cross-reference-only
articles now have visible result rows, reference counts and their own opening
identity instead of disappearing while still contributing to the server count.
Whole articles and exact read ownership remain intact.

Validation: 101 existing/focused tests pass, plus three preview-controller checks
for stale-response suppression, retry without Apply, and unavailable material.
Typecheck, targeted lint, style guard and diff whitespace checks pass. Existing
Training tests emit act warnings and the existing SenseCardReveal emits an inert
warning; this checkpoint does not claim those unrelated warnings are resolved.
Authenticated browser QA on the actual local UI checks goed -> Nouns/het -> one
article with all four meanings, source Cancel, focus return, and aangezien's
cross-reference-only article. At 320px viewport with the account's larger text
profile, the dialog has no horizontal overflow and keeps actions inside the
viewport. Prototype chips and Builder language expansion remain functional.

This completes the search-filter connection, not the whole Library acceptance
gate. Owned collection/editor presentation, personal translation language,
Statistics/history/mobile navigation and active-session acceptance remain open.
Production is not deployed.

## Collection rows and personal translation checkpoint — 2026-09-30

The approved collection/flat-entry path now uses the shared Library list and rows
instead of separate Tailwind cards. Entry IDs, list paging, hydration and actions
remain with their existing owners. Definition previews stay visible for individual
collection entries, including when an article is open and on narrow screens, so
multiple senses of one headword remain distinguishable. Only de/het evidence is
rendered as a Dutch article; generic gender metadata is not presented as an article.
Counts/status messages use the shared workspace text tokens.

Personal entry creation no longer hardcodes English. The input names the selected
translation language and the existing create-user-entry action receives that
language. Off disables the field and omits translation data. Draft translation text
is bound to the target under which it was entered; changing the target cannot
silently relabel existing text. Content/entry identity, private ownership and
collection/train-next mutations retain their existing boundaries.

Validation: 17 DictionarySearchTab checks pass, including Russian target, Off,
mid-edit target change and collection entry selection; all 70 TrainingScreen
checks pass after correcting its obsolete English expectation for a Russian
startup preference. The five other presentation/localization suites passed their
16 checks. Typecheck, targeted lint, semantic style guard and whitespace checks
pass. The first combined run failed at the old translation-label assertion and
left its one-shot next-card mock unused, cascading into a later train-next test;
correcting the selected-language expectation makes all 70 checks pass. Existing
act/inert warnings remain tracked rather than hidden.

Authenticated local browser QA reads the real VanDale 2k collection (4031 entries),
selects aandacht by its original entry identity, and confirms the shared full
article. The personal editor shows the account's English translation target in
its Russian interface. No QA entry or learner action was created in the database.

Remaining Library acceptance still includes editor placement/overflow, empty/error
presentation and pointer-only collection summaries. Statistics/history/mobile
navigation, typography/color consistency and active-session acceptance remain
open. Production is not deployed.

## Personal editor viewport and Library states — 2026-09-30

The approved personal-entry form now uses a shared native dialog presentation
surface, retaining the existing draft fields and create-user-entry action owner.
Its form scrolls inside the viewport and its save controls stay at the bottom.
Opening the editor no longer consumes the fixed search toolbar and squeezes the
result list. Cancel/Escape restores the actual Add entry trigger. A pending save
disables submission and dismissal; existing legacy presentation remains compatible.
Library empty/error/loading states now use semantic theme and text-size tokens
instead of independent slate/rose colors and fixed Tailwind text sizes.

Validation: 19 DictionarySearchTab checks pass, including modal cancellation with
no mutation and pending-save dismissal/duplicate-submission guards; the shared row
check also passes. Typecheck, targeted lint, shared style guard and whitespace
checks pass. Existing act warnings remain visible. Real local browser QA confirms
RU labels and the English account translation target, native Escape/focus return,
and no horizontal overflow at 320px with larger text. At 320x380, dialog bounds
are y=16..364, the body scrolls (437px content in 282px), and Save remains visible
at y=322..351. This is a short-viewport simulation, not a physical mobile keyboard
test. No account setting, entry or learner state was written during browser QA.

Remaining gates are pointer-only collection summaries, full Library empty/error
runtime acceptance, Statistics/history/mobile navigation, shared typography/color
consistency and active-session acceptance. Production is not deployed.


## Shared recent history checkpoint — 2026-09-30

The approved History destination and prototype now share RecentActivityList,
semantic typography/colors and the animated PracticePanel. EN/NL/RU strings live
in the UI catalogs. Statistics provides a Recent activity entry point; closing
history returns to its actual originating screen and restores trigger focus.
The existing 50-actions/24-hour service, principal guard and fetch-on-open owner
remain intact. Loading, retry, empty and truncated states are explicit.

Browser QA exposed a real stylesheet-loading regression: the dynamically loaded
history component rendered an unstyled native dialog even after reload. History
is now imported with the main screen, ensuring its panel CSS is available; the
history request still runs only when opened. At 320x620 with larger account text,
the panel occupies x=0..320, y=12..620, with no horizontal document overflow and an
independent scrollable list. Real local history reads two existing learner actions;
Statistics return/focus was verified. No learner/account data was written. A full
50-item runtime scroll remains an acceptance check rather than a claimed result.

Validation: 99 checks across TrainingScreen, History destination, shell navigation,
history service and message catalogs pass. Typecheck, targeted lint, semantic style
guard and whitespace checks pass. Existing act/inert test warnings remain visible.
History coverage is still limited by the real service to Learn/review and its four
word exercise modes; broader action/card-family coverage and immutable event IDs
remain backend work. Production is not deployed.

Owner decision for the next Statistics slice: Study time measures active time on
an open training card only. Background tabs, loading, history and settings do not
count. Store this as a distinct measured duration, not a value inferred from review
counts or full session wall time. The previous frozen-material decision remains:
started sessions may resume/finish; dictionary disabling and language pausing affect
new launches/material choices, subject to live authorization checks.

Next: real Statistics read model and approved screen adaptation, including active
card duration; then remaining Library, mobile navigation, typography/color and
active-session acceptance gates.


## Active study measurement foundation — 2026-09-30

Added a separate monotonic clock and browser attention hook for the approved
active-card duration. This is a prepared measurement seam, not enabled telemetry:
actual card-owner eligibility and durable persistence remain the next slice.
It does not change FSRS, action history or displayed Statistics values.

The adapter accepts an owned principal/session/family/card identity, pauses through
explicit caller eligibility and document visibility/window focus, flushes on
checkpoint/replacement/unmount/pagehide, and resumes after pageshow. Reveal does
not restart the card clock. Fifteen-second checkpoints and rejection of unknown
gaps over thirty seconds prevent sleep/suspension from inflating study time.

Validation: 12 clock/attention tests pass, including fractional and backward-clock
handling, paused/loading/background intervals, identity/account replacement,
StrictMode/reveal continuity and timer/listener cleanup. Typecheck, targeted lint
and whitespace checks pass. The initial test invocation used the UI cwd with
repository-relative file paths: it ran only the five clock tests. Correcting the
paths created the hook suite and the combined 12-check run passed. No database
or account data was changed, and no UI/browser acceptance is claimed for an
unconnected measurement hook.

`docs/exec-plans/407-study-time-integration.md` records the measurement semantics,
actual owner/overlay gates, authenticated/idempotent storage requirements,
study-day attribution and remaining real Statistics acceptance. Next: dedicated
server duration storage with SQL ownership/replay tests, then integrate the ordinary,
idiom and sentence owners before showing measured time. The broader approved
Statistics and remaining #407 gates are still open. Production is not deployed.


## Active-time server storage — 2026-09-30

Dedicated duration storage and first-party write/read API now exist under migration
187. Principal/session/member/family identities are validated in the database;
retries replay immutable receipts, conflicting payloads do not add milliseconds.
The bounded read model splits intervals at the persisted learner-local 04:00 day
and carries measurement coverage metadata. No FSRS/action/session progress state
is changed. The browser measurement hook is still unconnected, so this milestone
does not imply live collection or completed Statistics presentation.

264 disposable SQL/FSRS tests pass, including five new active-time storage cases;
18 clock/hook/API checks and 19 deployment runner checks pass. Typecheck and targeted
lint pass. Initial SQL tests exposed a NULL aggregate bug that inflated empty days
and a reserved fixture alias; both are fixed and the suite rerun passed. Exact
manifest/probe chains target contract 187. Retaining local apply passed without a
reset; see `407-study-time-integration.md` for semantics and remaining integration.
Next: bounded client delivery, actual ordinary/idiom/sentence readiness/overlay
pause gates, then full approved Statistics with real historical read models.
Production is not deployed; all other #407 acceptance gates remain open.


## Active-time browser wiring — 2026-09-30

Approved Training presentation now wires the attention recorder to prepared owned
ordinary/idiom/sentence members, with global navigation/drawer/load gates and local
submission/recovery gates. Open native/modal dialogs and menus pause the shared
clock. Captured member metadata survives replacement without relabeling. Delivery
is a bounded memory queue, principal-guarded, immutable-ID retried, timeout-bounded
and independent of grading. Rollout off creates no measurement identity/timer.

161 session/screen/attention/delivery checks and three wrapper gate/identity checks
pass; typecheck and shared style guard pass. Existing ordinary handlePlayAudio lint
and act/GoTrueClient warnings remain tracked. Real-browser storage/focus/pause
acceptance is still pending; this is not proof of complete measured Statistics.
See `407-study-time-integration.md`. Next: local real-data attention smoke, then
Statistics read models/presentation and the remaining #407 gates. Production is not
deployed.

## Active-time authenticated transport acceptance — 2026-09-30

The real local ordinary-session smoke uncovered 401 responses from a cookie-only
measurement POST. Delivery now uses the existing expected-account bearer request
helper; no server authentication change. Two actual-delivery regressions cover the
missing header and the account switch between queue guard and token capture.
23 attention/delivery/wrapper/API tests, typecheck and targeted lint pass.

Stored positive increments and paused intervals are verified in the local private
store: History, full-word article and Report remain unchanged beyond a sampling
cycle, with increments resumed on the card. No grade/Learn/exclusion/report action
was submitted. The QA session remains resumable; temporary tabs are closed. Tool
tabs both report focus/visible, so normal-browser background acceptance is still
open, as are live idiom/sentence smokes and full Statistics. Exact checkpoints and
limitations are in `407-study-time-integration.md`. Next: measured/historical
Statistics read models and presentation; production remains undeployed.

## Measured duration in working Statistics — 2026-09-30

The shared measured-time section reads server-owned Today/last-seven-study-days/
current-study-month durations with explicit date ranges, current language scope,
coverage-start warning, loading/error/retry and sub-minute/known-zero distinction.
It uses account typography/theme tokens and EN/NL/RU catalogs behind the existing
presentation flag. No demo minutes, client timezone or new schema. Account/scope
replacement aborts stale reads and cannot show another account's time.

26 time-period/read/presentation/API/catalog checks, 83 TrainingScreen/theme checks,
three prototype Statistics locale checks, final typecheck/lint/style guard pass.
Initial type errors were repaired; existing screen test warnings remain. Real
local UI shows 4 min for 249,436 stored ms, with the table unchanged on Statistics;
day/week/month and 320 px Larger-text dark appearance are verified. Viewport reset,
temporary tabs closed, no preference/learner action changes. Full screen adaptation
remains open: real history calendar/highlights and material/queue/launch/read scope,
including removal of the old loading fallback that briefly displays zero/2000.
See `407-study-time-integration.md`. Production remains undeployed.

## Independent review — 2026-09-30 (new agent, from d5e754fa)

Whole-series review against source and the running local UI (not prior reports).
Screenshots: `/tmp/407-review-*.png`, `/tmp/407qa/*.png` (evidence only).

| Requirement | Current implementation | Direct evidence | Remaining gap |
| --- | --- | --- | --- |
| Owners intact (data, prefs, actions, scheduling) | Production never imports `app/dev`/fixtures; setups/material/palette/text are account-owned; actions go through Platform V2 | grep of `components`/`lib`; `/api/training/setups`, `/api/settings/material` route code | none found |
| Shared article + full-word panel | `ProductionArticleReading`/`ArticleWordForms` in Training answer and Library; drawer opens `TrainingMoreSenseCardV2Session` with the current `entryId` | `TrainingScreen.tsx` drawer; live card `ervaren`/`natuurlijk` | sequential current-meaning reveal in drawer not verified visually |
| Training session presentation | Flag adds geometry only: legacy card surface, legacy `Учить`/rating buttons (hardcoded slate/hex in `TrainingCardTemplates.tsx`), no `RatingControls`, no `usePromptReveal`; header shows queue label, not training name | source grep; live 1024px session screenshot vs prototype | P1: approved card surface, ratings, reveal motion, header |
| Palette canvas | Legacy `dark:bg-background-dark` and session `#171c24` painted over palette | computed styles (`rgb(15,23,42)` wrapper) | fixed in 842afc4a |
| Statistics | Legacy layout + separate time block; no per-day history read model | `StatisticsDestination.tsx`; DB inventory | activity/calendar/highlights done below; material chips/coverage/language tabs open |
| Mobile navigation | Production uses a header dropdown menu; prototype uses a bottom tab bar | 390px screenshots of both | P1 open |
| Background-tab time | Integrated browser tab reported `visibilityState: hidden`; two open sessions (one revealed ≈1 min) wrote zero receipts | `private.training_active_time_v1` counts per session | normal-browser focus-loss (visible but unfocused) still open |

The IAB note in the study-time plan (both tabs focused/visible) did not reproduce:
the VS Code integrated browser reported hidden, which is a useful negative check.

## Statistics activity on real history — 2026-09-30

Owner decisions: Activity/calendar/streaks count all exercise families in the
learning language; the material section uses collections/dictionaries plus All
enabled material (read model pending).

Migration 188 adds read-only `get_training_activity_days_v1(language, days≤366)`.
The server derives the principal and the current 04:00 study day; new = start-learning
or first graded `new` review (per card, per day), reviews = later graded reviews,
and for idiom/sentence the first `review-exercise` of a target is new, later ones are
reviews. Measured time is delegated to the migration-187 reader. History is not
filtered by current access/material preferences. `/api/training/activity` (first-party
bearer) validates a complete consecutive calendar; the client computes Today/Week/
Month, streaks, best day and 30-day average from it.

`components/practice/statistics` now owns Activity, the year/two-month calendar,
day detail, highlights, queue and coverage. The prototype renders the same components
through an explicit fixture adapter; its obsolete CSS was removed. Production shows
loading/error/retry instead of zeros, a dash for unmeasured time, and the measured-since
note; the queue appears only once the current-scope counters are ready. The
separate `MeasuredStudyTime` block is replaced by the Study time metric.

Validation: 267 disposable SQL/FSRS tests (3 new), 43 harness/deploy tests (a stale
`read-only-postflight-186` expectation now reads the manifest), retaining apply +
read-only check at contract 188 (bounded probe 1474 ms), 30 focused UI tests, 83
TrainingScreen/theme tests, typecheck, targeted lint and style guard. Headless local
QA at 1024px and 390px: real data (2 new today, 4 min), no horizontal overflow, no
console errors on Statistics.

Next: material read model (collections/dictionaries + All; due and started/total in
cards) with language tabs from account material order; then Training session card
surface/ratings/reveal/header; then mobile tab navigation.

## Statistics material scope on real read models — 2026-10-01

Migration 189 adds read-only `get_training_material_progress_v1(language)`: All
enabled material, each readable enabled dictionary (live ACL, user dictionaries
never disabled) and each curated/own collection with entries in the language.
Coverage = distinct started meanings / total; due = scheduled directions due before
the 04:00 study-day end, excluding cards first introduced today (same rule as the
current counters). Capped at 200 named materials; nothing is written. Contract
`2000nl-db-189` with `training-material-progress-probe.sql` in the read-only
postflight.

`/api/training/material-progress` (first-party bearer, `language` only) validates
rows fail-closed. `AccountStatistics` owns language tabs (account material order,
paused languages cannot start), the material picker/dialog, queue and coverage;
each read has its own loading/error/retry. "Practise" hands a
`TrainingMaterialIntent` to the builder: it switches language first, opens the
builder with the chosen material and never starts a run; another account's intent
is dropped. The legacy zero/2000 fallback is no longer shown on the approved path.

Validation: disposable SQL/FSRS 269 tests (material progress + activity included),
manifest validate and retaining check at 189, 8 new UI/API tests (route, intent),
54 Statistics/setup tests, typecheck, targeted lint, style guard. Headless local QA
at 1024px and 320px (dark): real queue 4 / coverage 2 of 18 163, material switch,
Practise → builder with VanDale Dutch and no run; fixed tiny-ratio "0 %" and
clipped material chips at 320px.

Open: language tabs with several configured languages and the paused state not yet
seen in a browser; EN/NL copy reviewed only through the localization test.
Next: Training session card surface/ratings/reveal/header, then mobile tab navigation.

## Independent audit response — 2026-10-01

Source: parallel read-only audit (`HANDOFF-for-implementer.md`, OS temp) at `f12434f8`.
Owner decisions D1–D5 applied in `83d403f1`: brand accent/focus follow the palette;
forms line capped at 1.6× (Extra 28.8px); muted ink resolves to secondary inside
`aria-pressed/selected/current` states (the real selected fills are `aria-pressed`);
heatmap levels at ≥3/4.5/7:1 to canvas in all six palettes (contrast tests added).
Primary navigation now uses frame roles (12px/500, muted inactive); 320px brand and
overview actions no longer collide/overflow.

`43f4a46f`: the approved Training card uses practice roles and the text scale for
stage, shell, Show answer, hint, Learn, Known and quiet actions; ratings render via
shared `RatingControls` with capability-owned labels/actions (columns follow measured
labels, hit area ≥44px); face headword uses the 44px display role; session name/
position scale. The Playwright spec now asserts behaviour, not 62/46px heights.

The style guard now ratchets legacy colour/size literals in `components/training`
and `components/navigation` (`scripts/practice-style-baseline.json`, 1376 remaining,
mostly flag-off legacy branches, Library search/editor and legacy Settings/Statistics).
The earlier "zero literal colors" claim applies to prototype files only.

Open from the audit: live rating row (QA first card is new; Learn writes state —
not pressed), article action row slim/toolbar (item 3), reveal motion
(`usePromptReveal`), mobile tab bar, computed-style matrix (palettes × modes ×
Standard/Extra), RU/320 and 844×390 snapshots for Library, zoom/keyboard/portals.

## Takeover: complete the unfinished mobile frame — 2026-10-01

Recovered the successor's commits through `fec1f350` and its uncommitted frame
markup/tests in the existing #407 worktree. The pending markup referred to absent
`tabBar`/`tabBarNav` styles. Added the missing palette-aware bottom row with three
equal zones, scaled captions, safe-area padding, keyboard focus and ≥44px touch
targets. Under 768px, approved active meaning/idiom/sentence sessions hide both
app header and tabs; desktop retains its header/navigation. Exiting restores tabs.
The flag-off compact menu remains available.

Updated the browser fixture harness for account-owned setups/material reads and
writes, and the specs for the approved overview's new launch label. Earlier runs
failed on stale fixture assumptions (missing account endpoints, old launch label,
ambiguous heading and the retired daily footer), not an accepted product pass.

Validation: typecheck, targeted lint, style guard (1376 legacy literals unchanged),
37 focused unit/component tests; 4 approved navigation/card browser checks at
320/390/402/1024px, plus 4 stable-frame checks (desktop return preserves card and
side, compact session controls, pending-action navigation lock). Three legacy-only
menu cases are deliberately skipped with the approved flag on. Screenshots were
visually inspected at 320px. Browser checks use deterministic transport fixtures;
they do not prove server persistence or finish the real-data acceptance matrix.

Next: remaining audit/acceptance matrix, starting with palette/scale/locale layout,
word-sheet keyboard/portal behavior and reveal motion. The full #407 objective is
unfinished. The goal tool still reports paused and exposes no resume operation;
the owner's explicit resume instruction authorizes ongoing work, but automatic
goal continuation needs the app's Resume control.

## Compact appearance matrix and metadata collision — 2026-10-01

Six palette/mode combinations × Standard/Extra on the actual approved Training
components, Russian at 320×568, now have a transport-fixture browser matrix. It
loads appearance/text preferences through their existing account owners, checks
all rating labels and controls fit, and captures each answer. Visual inspection
found that the long POS label at Extra overlapped audio/translation/details despite
no document overflow. The approved answer header now wraps the toolbar as a unit
when intrinsic metadata width requires it, preserving its right alignment. Added
an explicit metadata/control intersection assertion; do not equate document width
checks with complete layout acceptance.

Also verified the existing forms/relations presentation at 320/430/1440px in both
OS modes (6 browser cases). These are fixtures, not live persistence evidence.
Typecheck, targeted lint/style guard and 11 shared-presentation tests pass.

New source audit finding: `usePromptReveal` is currently imported only by
`TrainingSessionPrototype`, not production `TrainingSenseCardStage`. The accepted
moving-prompt reveal has therefore not yet been integrated on the approved working
Training path. Next implement and verify this seam, including reverse/context
prompts, reduced motion, focus and grading lock; then continue live-data and the
remaining zoom/landscape/keyboard/word-sheet matrix. No final rollout sign-off.

## Working meaning-card reveal — 2026-10-01

The approved `TrainingSenseCardStage` now captures the visible question before the
side change. A non-interactive, aria-hidden snapshot starts at that exact rect in
the first frame and moves to the answer's matching word/definition in 420ms. The
answer content fades in after arrival; grading and its hotkeys stay blocked during
movement, then focus goes to the first available action. Context-word prompts
resolve their latched example translation by content-node identity. No controller,
lookup, scheduling, capability identity or learning mutation changed.

The shared presentation hook owns only the temporary motion layer/lock: reduced
motion or a missing target skips movement; cancellation, resizing and unmount
restore visibility/remove the snapshot. Failed animation execution falls back to a
usable answer. Existing flag-off presentation stays immediate.

Validation: typecheck, targeted lint, unchanged style ratchet; 83 stage/session/
motion tests, including first-frame origin, grade lock, reduced motion, cancel,
unmount and unsupported animation. Four browser cases prove direct/reverse
motion, initial snapshot origin/opacity, arrival/focus and reduced-motion bypass,
plus retained 402/1024px dock bounds. Browser uses transport or dev fixtures, not
live state-write proof. Context translation target selection needs a dedicated
browser scenario, and idiom/sentence `TrainingExerciseCard` still needs the same
transition seam. The entire accepted reveal scope is not yet complete.

## Idiom/sentence reveal and shared ratings — 2026-10-01

`TrainingExerciseCard` now uses the same visual-only reveal hook. Its projection
provides an explicit `promptTarget` (content node + text/translation): direct idiom
→ expression, reverse idiom → its owned explanation, sentence translation → the
selected example's ready target-language translation. This is a UI presentation
field, not an API/DB identity or new scheduling contract. The source fingerprint,
translation readiness checks and grade/action owner remain unchanged.

Captured descendant font sizes remain relative during motion so a large expression
can shrink into the article's reading size. Approved exercise ratings now reuse
`RatingControls` (adaptive 46/28 visual size, palette/text roles, measured columns)
rather than the leftover 42px legacy buttons. The existing `onGrade` callback and
fail/hard/success/easy values are preserved; motion blocks buttons and hotkeys until
arrival, then restores first-grade focus. Flag-off legacy stays available.

Validation: typecheck, targeted lint/style guard; 15 projection/card/motion tests,
including selected node identities and shared-rating callback; three browser cases
with the real card and controlled dev content fixtures (direct/reverse idiom,
sentence translation). A first draft accidentally placed ratings in the answer
slot; the browser checks failed, the placement was corrected, and the repeated
checks pass. No claim of live scheduling/mutation acceptance from these fixtures.
Still open: context-word browser reveal, live exercise mutation/resume matrix,
remaining visual/zoom/landscape/keyboard/portal checks and owner rollout review.

## Context reveal and live meaning-session persistence — 2026-10-01

The reading dev gate can now latch a translated context example by content-node
identity. A dedicated browser check proves the moving question starts at its
original rect, lands on exactly one matching translation, and restores rating
focus only after arrival. This is controlled-content evidence, not a live context
launch. Typecheck and 10 idiom/sentence tests pass; the new context browser case
passes. Corrected a Testing Library query introduced in the preceding checkpoint:
its role options do not accept `exact`; an anchored name regex preserves the same
intent. The subsequent typecheck verifies that correction.

Signed-in IAB QA on the real local contract-189 database, Russian, 703×987:
started a 10-card meaning session; revealed `wensen`, explicitly started learning;
revealed `het nummer`, graded Good; progress advanced to 2/10 and `tussen`.
History contains both actions after reload. Closing the run showed 2 done / 8
remaining; reloading resumed the same `tussen` face at 2/10. Closing history
restored that card and opener focus. No console errors were captured. These are
authorized writes to the local test account, not transport fixtures. Evidence:
`/tmp/407qa/live-resume-2026-10-01.jpg` (temporary artifact).

This closes the tested meaning-session mutation/history/resume path only. Real
idiom/sentence/context launches, short landscape/zoom/text-spacing, drawer
sequencing/focus/portals and owner rollout review remain open. The local pilot
still has translation exercises disabled; no production flag or DB reset changed.

## Training word-panel entry sequence — 2026-10-01

The working Training details drawer now reuses `PracticePanel`/`DialogSurface`,
the approved modal motion and theme roles. Native modality blocks the page behind
it, Escape/backdrop/header close use the same animated dismissal, and unmount
restores the opener. The flag-off drawer remains in place. Training passes panel
arrival to the article presentation: all meanings start collapsed; only the
selected entry expands after arrival. A slow lookup is also covered—whether it
arrives during or after entry, the default first meaning must not expand alongside
the selected meaning. No lookup, action or scheduling semantics change.

Validation: typecheck; 116 existing drawer/session/group/panel tests before final
edge-case additions, then 49 focused tests including three new sequencing cases;
targeted lint/style guard (1376 legacy literals unchanged). Two browser scenarios
at 390/1024px prove the 460ms entry precedes disclosure, native modality does not
focus underlying app controls, Escape preserves the panel during exit and restores
the opener, and the answer side survives. Native keyboard navigation can focus
browser chrome; the assertion explicitly distinguishes that from background app
focus. A missing helper brace was caught by typecheck/dev compilation, corrected
before the successful runs. No failed draft is counted as acceptance.

Live IAB: real `tussen` has four meanings; observed all four collapsed on entry,
then only the current meaning expanded. Temporary visual proof:
`/tmp/407qa/live-word-panel-2026-10-01.jpg`. Remaining: short landscape/zoom and
text spacing, nested collection/report portals, live other exercise families,
Library actions/layout matrix and owner rollout review. Integration stays active.

## Short-window reading and keyboard reflow — 2026-10-01

The new EN/NL/RU Extra matrix found a genuine landscape failure at 844×390:
ratings fit, but the pinned header left only 28px of answer viewport. Reduced
outer padding alone was insufficient (43px). Active approved Training now also
uses immersive app chrome in short windows ≤1024px wide/≤500px high, including
phone landscape above the mobile width breakpoint. Close/history remain in the
session row. Short-window session/card gaps and outer padding tighten without
reducing text or rating touch targets. Tall and legacy presentation stay unchanged.

The answer scroll region now has an accessible name and a keyboard focus stop;
Space scrolls it instead of triggering the card-side hotkey. End/Home reach both
extremes while ratings stay visible. Added a unit regression for that hotkey seam.

Validation: typecheck, 19 stage tests, targeted lint, unchanged style guard. Ten
browser cases passed across navigation, word-panel sequencing and reflow; the six
EN/NL/RU reflow cases were repeated with stronger End-to-bottom assertions. They
cover 844×390 and 640×400 CSS space (200%-zoom-equivalent to 1280×800, not native
browser zoom), Extra, and text-spacing overrides: 1.5 line height, .12em letters,
.16em words, 2em paragraph spacing. Visually inspected Russian short-window
captures before/after. Fixture transport proves layout/keyboard, not live grading.
Remaining: native zoom, other exercise-family live runs, nested portals and Library
acceptance. This checkpoint does not close the full #407 goal or enable rollout.

## Library panel and nested modal ownership — 2026-10-01

The approved Library drawer now uses the same PracticePanel as Training: entry
finishes before the current meaning expands, and dismissal restores the opener.
The prototype overlay CSS moved to the shared practice library folder; neither
production screen imports dev components. Collections and Report use native
DialogSurface inside the account theme subtree. This fixes body portals being
inert or behind an already modal word panel. Collection search receives initial
focus; Escape closes only the top dialog and preserves the article. Existing
collection/report transport, diagnostic privacy, retries, and legacy flag-off
paths remain owned by their existing modules. The shared CSS adapter still
bridges legacy markup; this is not a claim that all legacy literals are removed.

Open native dialogs now suspend global Training shortcuts, including rating
keys fired from noninteractive reading content. The article scroll region is
keyboard focusable with a localized name and shared focus token.

Validation: typecheck, targeted lint, unchanged style ratchet (1376 literals);
92 component/owner regressions; three browser scenarios at 320/390/1024px with
EN/NL/RU and Normal/Extra profiles. They cover entry/disclosure ordering, nested
collection search focus, footer reachability, modal dismissal, opener restoration
and no underlying grading. Live IAB Library huis confirmed nested Report and
Collections styling and Escape behavior; Report was not submitted and collection
membership was not changed. Proof: /tmp/407qa/library-collections-2026-10-01.jpg
and /tmp/407qa/library-nested-report-2026-10-01.jpg. A jsdom selector-list cache
false negative in the new shortcut test was corrected using separate DOM queries;
browser behavior passed before and after. Remaining: compact Report matrix,
native zoom, live other exercise families, Library actions/empty/error acceptance
and owner rollout review. #407 stays active; no rollout was enabled.

## Report compact/Extra acceptance — 2026-10-01

Added a production Training Report browser gate at 320×568 and 844×390, Extra,
EN/NL/RU, lavender/blue/graphite and light/dark. Six scenarios verify bounded
width, pinned Back/Send, category selection, cancellation clearing input,
Escape/opener restoration and unchanged answer side. They also exercise the
actual report capture/outbox through a controlled accepted transport response,
then verify Sent and the focused/visible Close action. No live report is sent.
The scrollable Report body now has a localized keyboard focus stop and shared
focus styling; End reaches its bottom without moving the footer. Screenshots
were inspected in Russian compact light and English short-window dark.

The acceptance extension initially caught fixture incompatibility: attribution
entries used non-UUID IDs and displayed node translations used non-SHA identity
fields. These correctly fail diagnostic capture before transport. Added an
opt-in report-ready fixture path and a capture-contract regression; existing
attribution fixtures stay unchanged. Helper-scope/type errors in the draft were
fixed before final acceptance. Next's dev badge also overlapped the mobile Report
pointer target; the gate deliberately uses the actual keyboard activation path
and does not claim that development badge as a product defect.

Validation: six final browser cases passed after the keyboard-scroll addition;
nine (Report plus existing word-panel sequence) passed before it. Four focused
unit tests, typecheck, lint and unchanged style guard passed. Live Library huis
Report was opened and cancelled with focus restored; proof
/tmp/407qa/library-report-verified-2026-10-01.jpg. Controlled transport does not
prove server acceptance or live offline delivery. Remaining: native zoom, live
idiom/sentence and broader Library state/action acceptance, focus-loss study-time
measurement, final owner review. #407 remains active and rollout unchanged.

## Live idiom acceptance and exercise shell alignment — 2026-10-01

Live local test account: created a ten-item direct idiom session from VanDale 2k,
opened kiezen tussen een aantal zaken, revealed its owned explanation/example,
graded Good, and received het verschil tussen … en … at 1/10. After browser
reload (Library URL restored) and navigation to Training, the same next prompt
and 1/10 remained. History dismissal restored its opener and left the session
unchanged. Real accepted exercise mutation/resume is proven by server-backed UI
state, not fixture counters; no production account or report was touched.

The live run found that idiom/sentence sessions had not passed the presentation
flag to shared chrome/layout: they retained the framed header and duplicate
daily footer. Both now use the same approved shell and hide that footer under
the existing rollout, preserving legacy flag-off behavior and action/stat owners.
The builder reverse idiom preview now labels the answer as Idioms instead of
Words. 32 session/chrome regressions and 42 setup tests pass, including approved
and legacy shell checks and direction-label regression. Typecheck, targeted
lint/style guard pass; 1376 legacy literal count unchanged. The added builder
test initially used a Testing Library option absent from the installed types;
it was corrected to an anchored name matcher before final validation. Visual proof:
/tmp/407qa/live-idiom-answer-2026-10-01.jpg and
/tmp/407qa/live-idiom-resume-2026-10-01.jpg. Sentence live launch stays gated by
the unchanged local translation exercise rollout.

**Next concrete integration gap: history omits exercise-family actions.** Live
History did not show the accepted idiom grade. Current RPC
get_recent_training_review_history (migration 130) unions user_card_action_events
start-learning and user_review_log only. Idiom/sentence actions are durably stored
in user_training_exercise_action_events (migrations 151/154/166); they are not
queried. trainingHistoryService.ts also validates card_type_id against four word
TrainingModes. Extend an authenticated shared read projection and presentation
with exercise family/direction/target identity and label; preserve dictionary
access, 24-hour/50 limit, deterministic ordering and no duplicate ordinary
events. Do not disguise exercises as word card modes or add client-only history.
This is not a missing write and not proof that the full history requirement is
complete. Goal remains active; no rollout or deployment was performed.

## Unified recent history and owner window clarification — 2026-10-01

Recovered active goal and clean #407 worktree at 94223dd3; no uncommitted code
was present in this checkout. The previous checkpoint identified missing idiom
history correctly. Added get_recent_training_activity_v1, preserving the legacy
RPC. It reads ordinary Learn/reviews plus accepted idiom/sentence reviews, with
learner/access guards, stable event IDs, global 50 cap and localized family labels.
Node text is used only while its fingerprint matches the target; stale/unavailable
text falls back to headword, not raw source context or a guessed phrase.

The owner clarified that history should show the latest 50 regardless of age.
No accepted 24-hour requirement was found in current decisions/discussions; the
old window was implementation behavior. Recorded the new accepted decision in
2026-10-01-01-recent-training-history.md and current-decisions.md. Previous
24-hour notes above describe the superseded implementation, not the new contract.

Migration 190 is additive, has exact manifest checksum and read-only postflight;
local forward apply passed and contract is 2000nl-db-190. No reset, production
mutation, gate enablement, push or deployment. All 272 SQL/FSRS regressions pass,
including family merge, actions older than 24h, isolation/access, unchanged legacy
RPC, excluded views/non-grades, stale-text privacy, global cap and stable ordering.
30 focused UI/catalog/service tests, typecheck, targeted lint, style guard pass.
Existing async act warnings in the history retry test remain; no failed assertions.
Two draft edit commands used the wrong cwd and wrote nothing; rerun in repo root
succeeded before final verification.

Live local IAB History now shows the prior accepted kiezen tussen een aantal
zaken Good at 08:55 alongside ordinary actions. Closing returns to the unchanged
het verschil tussen … en … face, 1/10, with History focus restored. Screenshot:
/tmp/407qa/unified-history-2026-10-01.jpg. This is actual persisted exercise history,
not a new grade or fixture. Remaining: bounded all-time history query work for
large accounts; native zoom, gated live sentence and broader Library acceptance,
active-time focus loss, remaining exercise-specific action presentation and final
owner/rollout review. #407 remains active.

### Bounded all-time history follow-up

Migration 191 replaces the exact migration-190 signature, leaving 190 immutable
after local application. Each of the three accessible action streams is capped
at limit+1 before the global merge (at most 153 projected candidates for 50 rows).
Added learner/time/UUID indexes for ordinary reviews and Learn, complementing the
exercise index. ACL rejection may still examine older rows; the bound is on merge
candidates, not a claim that every possible scan examines only 153 rows.
The mixed-stream cap test now includes 31 ordinary +31 idiom actions at one
transaction timestamp, proving stable global ordering and no per-family 50 cap.
All 272 SQL/FSRS tests passed again; lint and exact local postflight passed.
Contract now 2000nl-db-191. Read-only EXPLAIN on the actual local QA principal
returned 8 rows (7 meaning,1 idiom) in 10.254ms/1846 buffer hits. This is a small
live-account smoke, not a production-scale load test. Remaining acceptance gates
listed above stay open; no rollout/deployment or goal completion was declared.

## Exercise secondary actions and real modal attention gate — 2026-10-01

Reviewed the exercise-family action owners: idiom/sentence cards already use shared
TrainingExerciseCard/RatingControls and shared quiet Report/Exclude styles. Pair
exclusion remains the existing explicit server boundary; this checkpoint does not
invent exercise Known actions or mutate ordinary meaning state. Exclusion/Undo
copy moved from the standalone component object to the EN/NL/RU catalogs with a
compatibility adapter for existing consumers. The idiom action error also reuses
the generic catalog failure copy. The approved secondary-action row now sizes from
its children and shared spacing roles, allowing wrapping; legacy flag-off geometry
stays unchanged. Its old fixed 24px height conflicted with scaled quiet actions.

Six production Report browser cases now additionally verify that Report/Exclude
have identical font family/size/weight/color and stay inside their action row at
Extra, EN/NL/RU, 320x568 and 844x390, three palettes and light/dark. Screenshots were
inspected in RU light mobile and graphite dark short window. The Next development
badge overlaps the left Report target on mobile; the existing gate uses keyboard
activation. This is a development-tool overlay, not a product icon/layout claim.

Added an opt-in UUID session identity to the controlled production test harness,
independent of entry UUIDs, without changing legacy fixture IDs. The actual
useActiveStudyTime/delivery path now has a browser gate with real elapsed time:
read a prepared face, open native Report, wait 17s (beyond 15s checkpoint), verify
no further measurements, close and resume, reopen and verify duration attributed
to the same session/entry/family. Transport is controlled/accepted; no live report
or study-time write is sent. This proves modal exclusion/delivery integration,
not real server acceptance or OS focus loss.

Validation: 40 unit/service/catalog/session tests, seven browser cases, typecheck,
targeted lint, unchanged style guard (1376 literals). A draft text extraction
truncated a component export: typecheck and the browser caught it; restored before
successful checks. Attempts to test real focus via a second tab in headless and
headed Chromium did not produce document.hasFocus=false, so they are not counted
as focus evidence. Fake elapsed-time stepping then made focus restoration timing
unstable; replaced with real elapsed time, preserving the original production
path rather than weakening assertions. Native OS focus-loss gate remains open.
Live IAB tab26 inventory is present but observations time out at
Emulation.setFocusEmulationEnabled, including the documented alternative snapshot;
standalone production Playwright remains usable. No browser/server restart or
new QA port was used. Native zoom, real focus loss, live gated sentence/broader
Library acceptance, remaining active-family copy and final owner review stay open.


## Shared exercise states and catalog ownership — 2026-10-01

Idiom and sentence loading/empty/completion copy now belongs to EN/NL/RU catalogs,
with the generic training completion plural rules reused for idiom counts. Shared
TrainingSessionState owns presentation only: onExit remains with each session;
loading exposes no premature action. Approved screens use shared theme/text-size
roles and the training primary action, with a separately scrolling, keyboard
accessible message region and pinned return action. Legacy flag-off styling is
consolidated without removing its fallback. Approved error/status notices now
also use theme roles and retain the existing retry/disabled owners.

A real geometry defect appeared at Extra in the Dutch short-window error state:
side-by-side text squeezed into many lines and pushed Retry beyond the viewport.
Notices now put readable text above Retry, bound message height and permit keyboard
scrolling while the action remains visible. Production component fixture checks
cover EN/NL/RU, idiom/sentence, loading/empty/completion/error, light 320x568 and dark
320x240 (48 state visits). Return and retry calls in this fixture are local signals;
this does not prove live grading, real network failures, or the full app shell.

Validation: 45 component/session/catalog/layout tests, six browser cases,
typecheck, targeted lint, diff check. Screenshots inspected: RU dark terminal at
keyboard scroll end, NL dark sentence error. Proofs:
/tmp/407qa/exercise-terminal-extra-ru-dark-2026-10-01.png and
/tmp/407qa/exercise-error-extra-nl-dark-2026-10-01.png.
Initial tests caught a wrong Dutch expected completion word, a Vitest cleanup
return type, and selectors including Next development tools/status nodes; corrected
scope and expectations. The actual Dutch Retry overflow above was fixed in code,
then the whole browser matrix was rerun. Legacy baseline relocation explicitly
moves 16 existing fallback literals to the shared component, removing 30 duplicated
session literals: overall count falls from 1376 to 1362. No approved literal styles
were introduced. Remaining gates: native zoom/OS focus, live gated sentence,
broader Library acceptance and final owner/rollout review. Goal remains active.


## Ordinary non-ready states and context locale gap — 2026-10-01

The approved presentation now routes ordinary initial/session loading, unsupported
mode, exhausted usable candidates, lookup failure and word-context preparation
through TrainingSessionState. The exhausted screen's legacy 360px minimum no
longer constrains the approved short-window layout. Existing data-state/test IDs,
exit owners, alternate-candidate retry and context retry remain authoritative;
loading does not expose a review. Failure presentation has separate retry and
secondary exit actions, with alert/status semantics and scrolling message content.
No scheduler, translation request parameters, session plan or DB contract changed.
Flag-off geometry is retained. Restored the flag-off notice's original span markup
(the prior shared notice checkpoint accidentally added a tab stop there).

Three hardcoded context-preparation strings are now in EN/NL/RU trainingSession
catalogs, including the Off-language instruction, pending translation and unavailable
example. These are UI copy, not translated dictionary content. The context status
uses body text instead of a display heading; its retry remains the existing exact
context-preparation path. Tests in each locale verify retry invokes preparation
without sending a learning action. A real session component lookup-failure test
verifies separate Retry/Back owners with no review, using a controlled 503 read.

Evidence: 70 TrainingScreen regression tests passed; 86 session/state/catalog tests
passed on the final code (156 distinct checks across the five suites). Nine browser
cases passed: existing 48 exercise state visits plus nine ordinary unsupported,
exhausted and two-action failure states at Extra/320x240 in EN/NL/RU. The browser
failure fixture renders the shared presentation, while the component test verifies
its actual session-owner wiring. These are not live backend error injections.
Typecheck, targeted lint, diff check and style guard passed (1362 legacy literals,
unchanged). RU failure at keyboard scroll end inspected and preserved:
/tmp/407qa/ordinary-failure-extra-ru-short-2026-10-01.png. Initial typecheck caught a
missing rollout import and a missing nullable translation prop in the new fixture;
added before final checks. Lint retains the pre-existing handlePlayAudio dependency
warning in the untouched auto-play effect (verified against HEAD). No new server or QA port started;
canonical local health is ok/contract191. Remaining whole-product gates, including
native zoom/OS focus, live gated sentence, broader Library persistence/actions and
final owner/rollout review, remain open. #407 stays active; no deployment claimed.

## Live Library collections and unknown-read recovery — 2026-10-01

Verified the local signed-in Library huis article and nested Collections through
standalone Playwright on canonical 3100 (health ok/local/contract191). Created a
uniquely named QA user collection through the actual UI/RPC, observed the meaning
membership checked and persisted after reload, then removed it through the UI and
verified unchecked membership after reload. Injected one controlled 503 removal:
the original mark remains checked, failure is shown, and later accepted removal
works. Collections were cleaned using the existing authenticated delete RPC;
read-only SQL confirms zero QA407 collections remain. No grades/learning actions
or Report were sent. The first script used Playwright uncheck(), whose synchronous
state assertion conflicts with a deliberately rejected controlled checkbox;
changed to click followed by explicit failure/checked assertions.

Found and fixed a real non-ready-state defect: loadMemberships swallowed read
failure, erased the last known membership and let an accepted write display Saved
without confirmed refreshed membership. It now distinguishes loading/ready/failed,
preserves the last successful result, keeps existing identity/generation guards,
blocks editing while the result is unknown, and gives a localized read-only Retry.
Failed reads are not empty collections. After an accepted mutation plus failed
refresh, Saved is withheld; Retry reads membership without repeating the mutation.
The picker shares its existing theme/error ink and keyboard scrolling region.
Collection creation/removal remains in the existing list-service/RPC owner.

Final live case mixed a real accepted removal with a controlled 503 membership
read. It displayed the explicit read error and retained disabled checked state;
Retry reconciled the actual unchecked server result with exactly one removal
request. Reload confirmed persistence and cleanup returned HTTP204/zero leftovers.
Proofs: /tmp/407qa/library-live-created-2026-10-01.png,
/tmp/407qa/library-live-failed-remove-2026-10-01.png and
/tmp/407qa/library-live-read-failure-2026-10-01.png. Request failure is simulated;
creation, accepted membership writes/reads/reloads and cleanup use the local DB.

Validation: 35 component/owner/catalog tests; three extended production word-panel
browser cases at EN/NL/RU and 320/390/1024px verify failed membership read, no false
empty state, disabled Create, read-only recovery, focus/Escape and unchanged
underlying answer. Browser transport in this matrix is controlled, not live.
Typecheck, targeted lint, style guard (1362 literals) and diff check pass. Draft
unit test used an incorrect card test ID; corrected to the actual owner markup.
Remaining: final approved Library action arrangement (current adapter still has
inline Known/Learn and a separate Report footer), native zoom/focus, live gated
sentence and final whole-product owner/rollout acceptance. Goal stays active.


## Approved Library meaning actions and shared top-layer menu — 2026-10-01

Approved Library actions now use the article's wide primary Learn (Undo for known)
and a quiet Collections/More row. Known and Report are meaning-menu actions;
legacy presentation is unchanged. Train next remains available only through the
existing owner callback when no primary capability applies. No review capability
is invented in Library. Report freezes the selected meaning entry and uses the
same Report sheet/outbox as Training. Copy to user dictionary retains its owner.

ActionMenu is shared with the prototype wrapper, inherits the containing palette,
uses the native popover top layer above native dialogs, bounds measured content
to the viewport, supports arrows/Home/End/Escape, and dismisses on external scroll
and resize. Menu-internal scroll does not dismiss it. Closing Report/Escape returns
focus to the selected meaning's More trigger. No server action contract changed.

Final checks: 53 unit/component/catalog tests, including selected Report snapshot
identity, no mutation on cancellation, exact Learn/Known owner capabilities and
busy guards; typecheck, targeted lint, style guard (1362 unchanged legacy literals),
and diff check. Nine existing browser regressions cover EN/NL/RU Extra Report and
word-panel/collection recovery; they do not directly cover the new Library menu.
Separate live local Library huis checks at 320x568, 430x932 and 844x390 verify the
new menu's actual native top layer, bounds, Escape/focus, Report cancellation and
underlying dialog retention. No Learn/Known/grade or Report submission was sent.
Settled screenshots inspected: /tmp/407qa/library-live-menu-320-2026-10-01.png and
library-live-menu-844-2026-10-01.png. First screenshot captured the arrival animation;
retaken after animation completion. Draft QA used a wrong RU dialog title and
clicked an offscreen opener before scroll settled; corrected both test assumptions.

Exclude remains pending a product answer: without a session, should exclusion
cover every ordinary mode (including audio), or only word/definition? Existing
exclude-pair requires a real trainingSessionId. Do not fabricate one or broaden
scope silently. Asked the owner asynchronously; no answer yet. Remaining independent
gates: native browser zoom/OS focus, live gated sentence and final whole-product
owner/rollout acceptance. History decision rechecked: latest 50 accepted actions,
no 24-hour cutoff, implemented by the current v1 service/RPC (190/191), legacy RPC
retained solely for older clients. Goal stays active; no deployment claimed.


## Native Chrome zoom exposes a collapsed Library reading region — 2026-10-01

Used a separate Chrome QA tab via the browser extension and native app keyboard,
not CSS zoom or CDP page scaling. Local authenticated goed article: browser zoom
200% gave viewport 717x473/DPR4 without horizontal overflow; native 400% gave
358x236/DPR8. Found a real defect at 400%: unbounded pinned word header consumed
the entire article body, so no meaning text was reachable. The shared approved
Library/Training-word-panel header now reserves at least half the group's height
for the reading body, permits keyboard scrolling when its lockup is larger than
that allocation, and has the existing shared focus ink. Normal-height lockups
remain fully visible and pinned. This deliberately relaxes the pinned-header
requirement only when it cannot fit; it does not shrink the user's font setting.
Legacy styles and data/action owners are unchanged.

Native 400% retest measured 62px header/181px content and 62px reading region/1202px
content: both respond to End and the last meaning is reachable. Screenshot/AX
inspected; no horizontal overflow. Chrome was restored to the original100%:
1434x947/DPR2, and the dedicated QA tab closed. No grading/action/report submitted.
Read-only evaluator first rejected document.hasFocus (unsupported sandbox API);
used only supported viewport DOM metrics instead. This is live Library zoom
proof, not live Training zoom or OS focus-loss proof.

Extended three controlled EN/NL/RU word-panel browser regressions (320/390/1024)
to a 240px-high viewport: reading region >40px, keyboard header/body scrolling,
no horizontal overflow, then original height and focus restoration. Three pass;
45 existing component/owner tests, typecheck, targeted lint, unchanged style guard
1362 and diff check pass. Remaining: Training native zoom/real focus loss, live
gated sentence, pending Library Exclude product scope and final owner/rollout.
Goal remains active. No deployment claimed.


## Live Training native zoom and real attention gate — 2026-10-01

Started the local QA account's authoritative ordinary VanDale 2k session through
Start training; revealed the ouder answer without Learn or grade. Native Chrome
keyboard zoom200% measured717x473/DPR4; zoom400%358x236/DPR8. Main Learn stayed
fully on-screen (46px, y152.75–198.75), no horizontal overflow. The answer region
remained keyboard scrollable (28px viewport/162px content at400%); End reached the
example. This is a short viewport usability limit, not a claim of spacious400%
reading. The default100% viewport1434x947/DPR2 was restored. Full-word short-panel
handling is covered separately by the prior Library/controlled-panel checkpoint.

Observed actual /api/training/study-time network receipts, not mocked requests.
Initial attention results were invalid for OS-focus proof: the Chrome browser-use
runtime enables focus emulation, so raising Finder alone still reported hasFocus
true and emitted receipts. Disabled Emulation.setFocusEmulationEnabled only on the
dedicated QA tab; CDP Runtime.evaluate confirmed visible but unfocused. After
separating buffered/final active receipts, an18-second unfocused interval produced
zero new measurements. Native click on the neutral session heading returned real
focus=true; subsequent active receipts resumed with HTTP200 and ordinary elapsed
samples (no background interval added). History, while native modal open longer
than the15-second sample checkpoint, emitted zero new measurements after its last
active flush. Closing history restored focus to its opener and preserved the same
ungraded answer/0 of10 position. History itself displayed a previous-day event
older than24h, consistent with the accepted latest50 rule.

Original focus-emulation setting was restored before closing the dedicated QA tab.
Codex app access is blocked by computer-use policy; did not attempt to bypass it,
used Finder instead. No file was opened/modified in Finder. QA wrote real session
start/resume and active-time receipts through existing owners; no Learn/Known,
grade/exclusion/Report action was sent. Scope: one ordinary new-card session/RU;
not all exercise families or every locale/reading scale. Existing controlled Report
attention test was rerun and passed (22.3s), verifying its15-second pause and same
resume identity. Documentation diff check passed; no implementation change in
this checkpoint.
Remaining: pending Library Exclude scope, live gated sentence and final whole-
product acceptance/rollout. This does not approve enabling deployment flags.
Goal stays active.


## Live sentence preparation failure and shared recovery — 2026-10-01

Used an isolated local QA server on3101 with translation exercises explicitly
enabled; preserved the user-owned canonical3100 server and its disabled gate.
The real sentence start reached /api/platform/translation HTTP500. A sanitized
debug response reports provider_unknown_error:a916ee424eb2d8d4630b04a1, configured
provider openai/fallback deepl, and hasKeys=false for OpenAI, DeepL and Gemini.
This is missing local provider configuration, not a database contract mismatch.
Requested an existing server env-file location; never printed secrets, fabricated
translations or populated fake cache. Successful live reveal/grade/resume remains
unverified until configuration is supplied.

Found the approved sentence initial failure left an empty card with a top notice.
Sentence and idiom owners now use the existing shared TrainingSessionState for
initial preparation failures, with distinct localized Retry and Back actions.
Failures after a candidate is displayed retain the existing notice. Legacy
presentation, target identity, loaders, scheduling and unavailable-member policy
are unchanged. Six EN/NL/RU recovery cases verify retry, exit and absence of grade
or unavailable-member mutations;37 relevant component tests pass. Typecheck,
targeted lint, unchanged style guard1362 and diff check pass.

Actual authenticated sentence failure/retry/exit at320x240 passed without network
mocks:5 next-read requests,0 action requests, both recovery controls on-screen.
Inspected /tmp/407qa/live-sentence-failure-fixed-2026-10-01.png. First draft tests
failed from a missing test import, corrected before passing. Initial QA guessed
Russian Back wording incorrectly; corrected to the existing catalog label. An
exploratory response-body diagnostic hung and was stopped; separate authenticated
HTTP debug supplied the sanitized diagnosis. Those failed attempts are not counted
as acceptance. Temporary3101 was stopped and generated Next config changes
restored;3100 PID22759 remains listening. No provider keys, DB reset, grade or
report submitted. Goal stays active; pending Library Exclude scope, provider
configuration and final whole-product acceptance/rollout remain.


## Ordinary Training exclusion choices restored — 2026-10-01

A current-source audit found another unfinished approved requirement: ordinary
Training supplied Exclude as a direct action, hiding the stage's existing Known
fallback. The authoritative model already supplies mark-known. The approved
TrainingExcludeAction now accepts that capability-owned label/callback and opens
the shared native ActionMenu with Exclude and Known. Selecting each invokes its
existing owner; opening/dismissing does nothing. Known acceptance/undo and pair
exclusion request identity/scope are unchanged. Legacy presentation stays direct;
exercise families without a Known capability do not gain a fabricated action.
Library exclusion scope still awaits its separate product answer.

Six focused action tests cover EN/NL/RU separation, opener focus, unavailable Known,
legacy and disabled behavior. A session-owner regression verifies the original
Known capability reaches the accepted-progress callback, without another lookup.
71 component/owner tests pass after adding it;20 unchanged stage/action-boundary
tests passed earlier in this checkpoint. Typecheck, lint and style guard1362 pass;
existing handlePlayAudio dependency lint warning remains at line618, untouched.
Three controlled production browser cases at320x568/Extra verify two bounded menu
items on Face/Answer, keyboard and pointer opening, Escape/opener focus and zero
action/exclusion requests. Inspected RU Answer screenshot in test-results. This
is controlled transport evidence, not new live grading or exclusion acceptance.

Initial browser attempt used mocked auth and reached the real login page; stopped
it and used the existing dev-login harness option. Initial pointer attempt opened
during automated scroll-to-trigger, which dismisses anchored menus by design;
waited two animation frames after scrolling, then keyboard Face/pointer Answer
both pass. A draft test write used the wrong working directory and a subsequent
root-level test command used an unrelated runner; neither is acceptance evidence.
Correct app-owned runner and paths passed. No server restart or live mutation.

Corrected practice-presentation.md's stale integration instruction of50/24h to
the accepted latest50/no age cutoff; historical checkpoints remain unchanged.
Remaining: Library exclusion decision, translation-provider configuration for
live sentence success, and final owner/rollout acceptance. Goal active.


## Optimized-build and production import-boundary audit — 2026-10-01

Built exact implementation head f7a8fedf7f23b6318f8824e095fdcb4a6f12d8dd with
approved Training/article flags enabled and sentence gate left disabled. Used
isolated tmp/407-release-next output, local placeholder public Supabase values
and the repository's font-response fixture. This verifies optimized compilation,
full build type/lint/static generation and packaging, not genuine font downloads,
provider configuration, authenticated production data or deployment. Build passes:
root99.6kB/392kB first-load JS. Existing v1 API re-exported route-config warnings and
the unchanged audio-effect dependency warning remain; they are not new UI errors.

Scanned current components/lib/root route imports: no dev/prototype/fixture/test
imports found. The root client-reference manifest initially appeared to contain
nine dev modules, but its cross-route lookup includes unloaded entries. Checked
the actual root app-build-manifest assets and their registered webpack factories:
332 registered modules, none of those nine dev-module IDs loaded by the root.
Do not mistake a client-reference lookup entry for a shipped root dependency.
This does not remove dev bundles from the build artifact itself; experimental
routes stay development-only, and shared approved components intentionally remain.

Started the generated standalone server temporarily on3101: root HTTP200, builder
prototype HTTP404, POST dev test-session HTTP404. The existing sense-card gate
returns HTTP200 with only its disabled-production placeholder; verified no
training-stage markup. It does not expose working prototype fixtures. This is
local unauthenticated production-mode route isolation, not live action acceptance.
Stopped exactly that owned server PID71839;3101 closed, canonical3100 PID22759
preserved. Restored the two generated Next config files to their pre-build HEAD.

Reran36 catalog/theme/account appearance/rating checks; six-palette contrast and
UI interpolation completeness are covered by those existing assertions, not a
whole-product accessibility certification. Post-restoration typecheck, style guard
1362 and diff check pass. Rechecked current adapters: working setup mounts approved
Overview/Builder; Settings mounts material/appearance/text owners; Statistics
mounts AccountStatistics; Library mounts shared reading/forms/relations. These
source facts do not substitute for final owner browser acceptance.

Corrected two stale current-decision implementation summaries that still called
all UI prototype-only or material UI pending. Historical ADR/checkpoints remain
unchanged. Remaining substantive gates: Library exclusion scope answer, existing
provider configuration for real sentence success/reveal/grade/resume, and final
whole-product owner acceptance before enabling rollout/deployment. No production
rollout or push performed; goal remains active.


## Whole UI suite and disposable SQL regression checkpoint — 2026-10-01

Ran the app-owned npm test suite against current implementation after integration
checkpoints. First result:1 failed/1577 passed/260 skipped;196 executable files
were covered, one failed. Failure was the sharedArticleReading test still looking
for a standalone checkmark button removed by the approved Library action menu.
Updated its interaction to open the real More menu and select the capability's
localized Known label. Retained original selected-meaning assertions and added
no-write-on-open, selected meaning still expanded and menu closure checks. No
production component, capability, source identity or mutation semantics changed.

Focused5 tests pass, then the full rerun passes196 files/1578 tests,25 files/260
tests skipped,82.82s. Those skips are DB-gated checks, not green SQL acceptance.
Ran the canonical scripts/db-local-supabase.sh test-fsrs separately against its
owned disposable database:28 files/272 tests pass,10.54s, wrapper exits0. Its
normal dropdb path and EXIT cleanup completed; no reset/import/apply to the
working local database or production target was requested. Counts are reported
per suite and must not be added as unique tests because utility tests overlap.

Post-change typecheck, targeted test lint and diff check pass. Full run retains
the documented Vite CJS/Node localStorage/multiple GoTrue-client harness warnings
and expected failure-path diagnostics; no failures on final runs. Logs are QA
evidence at /tmp/407qa/full-ui-unit-2026-10-01.log (initial failure),
/tmp/407qa/full-ui-unit-final-2026-10-01.log and
/tmp/407qa/full-fsrs-2026-10-01.log. These suites do not prove successful live
translation-provider operation, complete screen-reader/device acceptance or owner
visual sign-off. Existing provider-config and Library exclusion-scope questions
remain unanswered; deployment flags stay unchanged. Goal remains active.


## Owner resolves Exclude scope and translation configuration — 2026-10-01

The owner confirmed all ordinary word trainings, not one saved setup. Known stays
on one entry/card direction; Exclude spans all meanings of the selected headword
in both word/definition directions. Idiom, sentence translation and audio remain
independent. Recorded the superseding decision in discussions/2026-10-01-02-known-
headword-exclusion.md and current-decisions.md. Goal is active again.

Source audit: current pair key in migration168 covers one entry/recall or a separate
audio mode; exercise keys carry family/node/fingerprint. Existing table, API and
client accept only exclude-pair/restore-pair. Broadening the old key would silently
change existing marks, so preserve that contract and add an explicit headword
target/atomic boundary. Use durable private.platform_v2_headword_groups identity
resolved from the entry's active binding (or user singleton group), not spelling.
The next migration must extend private availability/read/review gates, retaining
old pair checks and lock ordering; API/client/undo and Training/Library adapters
then opt into the new headword boundary. Characterize both directions, sibling
meanings, unaffected families/audio, idempotency/undo/concurrency/ACL and FSRS
nonmutation before replacing the currently exposed ordinary Exclude behavior.
This checkpoint records the decision and owning seams, not a completed feature.

Owner authorized copying the reference checkout's apps/ui/.env.local or NUC
configuration. Found the local reference file and copied it into the worktree
with0600 permissions; git check-ignore confirms it stays out of version control.
Only provider-key presence booleans were inspected: OpenAI/DeepL present, Gemini
absent. Earlier failure resulted from checking only the worktree, not the reference
checkout. No secret values or remote production DB connection were exposed.
Use the local-Supabase QA wrapper when loading this configuration, so provider
settings cannot redirect database/auth requests to an external deployment. Live
translation success still needs retesting with the new local process configuration.

## Headword exclusion implementation — 2026-10-01

The owner selected all ordinary word trainings, independently of saved setup.
Migration 192 adds private Headword Group exclusion marks and immutable event
receipts, with a service-only atomic writer and strict first-party API parsing.
The existing pair boundary is unchanged for old clients/audio/exercise families.
Ordinary planning, daily queue availability, latched reads and review guards now
respect group marks in both recall directions. Training consumes only its owned
current member; Library supplies no fake session or direction. Undo restores the
exact own mark without rewinding session actions, Known or FSRS. Delayed retries
return their immutable original receipt rather than re-excluding after Undo.

Training and Library use the shared exclusion/undo owner. Library's approved menu
contains Exclude word, the original Known capability and Report; opening the menu
is read-only. Copy is in EN/NL/RU catalogs. Training resets prefetched turns after
group exclusion. Only a successful exact server Undo unlocks the still-open
Library action; dismissal and another user's mark cannot unlock it.

Evidence: all 277 SQL/FSRS tests pass in 29 files, including five new headword
scenarios covering sibling/future meanings, directions, other groups/users,
independent audio/idiom/sentence families, no progress rewrites, immutable retry,
stale/foreign Undo, revoked dictionary access, session ordering/budget and a
concurrent sibling review. An expanded candidate test initially failed because
the scheduler read the old pair table directly; added a guarded patch preserving
the latest scheduler body. A queue fixture initially used requested_total=0;
corrected its test budget to the real finite-session contract. No product logic
was changed to accommodate that fixture.

Full UI run: 196 files / 1,593 tests pass, 26 DB files / 264 tests skipped and
covered by the separate disposable DB run. Subsequent receipt/Undo additions:
40 focused API, client, Library and hook checks pass; typecheck passes. Lint passes
with the existing audio-effect dependency warning at TrainingSenseCardV2Session
line618. Theme/style guard passes (legacy literal ratchet 1,362). Manifest validates
contract192; migration/probe checksums are registered. Bootstrap additionally
includes the previously omitted190/191 history migrations before192.

Pending for this checkpoint: commit, retaining local forward apply/postflight and
real authenticated browser Exclude/Undo smoke. Translation configuration is now
present, but successful sentence provider/reveal/grade smoke still requires a new
local QA process loading that environment. No production rollout/flag changes,
push, merge or reset have been performed. Goal remains active.

## Runtime headword verification and sentence reveal regression — 2026-10-01

Implementation commit a98c8a65d24ad85e2d71be27fd78a57946b8ba38 is installed in the
retained local database via the managed forward gate. Contract192 is compatible;
read-only check/postflight pass; bounded read probe1,500ms within2,000ms budget.
Canonical3100 remains running and healthy. Actual authenticated Training Exclude
returned a Headword Group receipt and consumed ordinal1 of10 once; exact Undo
returned the same mark and did not rewind that action. Library Exclude/Undo also
returned real receipts with consumption:null and no session/card direction. Its
menu became enabled again after the accepted restore. No grades were sent in
these exclusion scenarios; no active headword exclusion marks remain afterward.
The first pointer menu test dismissed during programmatic scroll; settling scroll
and keyboard activation verified the same live menu successfully.

The reference .env.local configuration is now verified on a separate wrapped
local3101 process, preserving the user's3100. Actual sentence face used English,
answer used the scheduled Dutch sentence. A forced authenticated dictionary
translation request to /api/platform/translation returned HTTP200/status:ready,
X-Platform-Cache:provider, proving a provider call rather than cached readiness.
No secret values were printed or committed. A real sentence Good action returned
HTTP200; progress changed0/10→1/10 and the next sentence survived a page reload
in that same browser context. One local QA sentence grade was intentionally
recorded; it was not deleted from history or disguised as test-only state.

This smoke discovered a real reveal bug: TrainingScreen passes an inline
onSessionSuperseded callback. Its identity changes on parent re-render; the sentence
loader's dependency list then reloads the unchanged member and hides the answer.
The minimized parent-callback replacement test failed before the fix. Notification
now uses the latest committed callback ref, while loading remains keyed by user,
session and content/translation language. Both regression checks and existing
sentence/idiom/loader cases pass (32 tests), as does typecheck. Actual reveal,
accepted grade and same-context reload prove the original symptom fixed. Initial
fresh-context resume attempt had no browser resume record; it did not test reload
and is not counted as a failed same-context resume. Temporary3101 was stopped;
its generated next-env/tsconfig changes were restored from exact pre-QA copies.

**Next mandatory alignment: directional Known.** Reading canonical CONTEXT.md and
migration138 revealed an older rule: sync_shared_meaning_known_mark automatically
creates/clears the other recall-direction mark. Therefore the earlier claim that
Known already matched the owner's one-direction decision was incorrect. The
accepted2026-10-01 decision remains authoritative; current Known implementation
is not yet aligned. Implement an additive forward contract with directional new
marks and exact Undo, preserving existing paired marks/receipts/history rather
than deleting past learner decisions. Update the domain glossary and owning
regressions together. This is concrete remaining work, not a completion claim or
request for another product decision. Goal remains active; no push/merge/deploy.

### 2026-10-01 — Directional Known, migration 193

Owner confirmed Exclude across all ordinary word trainings; Known remains one
meaning and selected direction. Migration 138's trigger was the mismatch.
Migration 193 defaults new marks to server-owned directional scope; existing
ordinary marks retain meaning scope and original paired Undo/receipts. Historical
Undo matches originating event, never an independent new reverse mark. Audio
remains directional; FSRS and history are not rewritten. Table writes remain
RPC-only. Updated current decisions and CONTEXT; registered forward/read-only
193 contract with exact checksum and bootstrap order.

Validation: 29 disposable SQL suites / 278 tests passed, including independent
reverse Known/Undo, legacy paired Undo, replay and scheduler protection. Typecheck
and active guidance check passed. First managed apply rejected the missing
transaction wrapper; added the required BEGIN/COMMIT and regenerated checksum
before retry. Full integration goal remains active; this closes the Known
semantics mismatch, not the remaining UI/integration acceptance work.

## Consolidated acceptance audit and live directional Known — 2026-10-01

After local193 apply, canonical3100 health reports healthy local DB193; source
launch stamp remains old while Next dev serves current worktree/HMR. Reused that
server without restarting the user's process. Automated authenticated Library
QA marked huis known via actual menu/action endpoint: HTTP200, only one active
word-to-definition mark with direction scope. Actual UI Undo HTTP200 removed that
exact mark; read-only DB check confirms zero active marks left. No grade/exclude
or unrelated user state was changed. Screenshot and reproducible scenario under
/tmp/407qa/directional-known-library-marked.png and directional-known-live.cjs.

Rechecked41 presentation/catalog/appearance/article/overview tests across8files;
all pass. Shared style guard/legacy1362 ratchet pass. Consolidated current recipe,
component/data owners, evidence coverage and explicit remaining owner visual
acceptance in 407-production-acceptance.md. This replaces reliance on scattered
historical pending notes; no claim of device/screen-reader or production rollout
acceptance. Asked owner for root UI visual acceptance asynchronously; can continue
independent evidence/cleanup but cannot infer approval from elapsed time. Goal
remains active pending concrete visual feedback/final acceptance.

## Directional Known scheduler selection proof — 2026-10-01

Reviewed current consumers after193: state read joins exact card_type_id; latest
ordinary scheduler excludes known_cards by exact mode. Sentence source familiarity
uses Known as positive source eligibility, not as a blanket sentence exclusion.
No stale runtime assumption requiring another behavior change was found.

Strengthened the real SQL queue regression: mark direct Known, create an
independent due reverse review, request both modes through get_next_card and
get_next_filtered_card. Both return the same entry only in definition-to-word;
known direct stays excluded. Initial assertion incorrectly expected table columns
from these JSON-returning RPCs; corrected to their actual item id/mode shape, no
product change. All29 SQL files/278 tests and UI typecheck pass; diff check clean.
This closes an evidence gap between mark storage and actual queue selection.
Owner visual acceptance remains pending; no rollout/production change.

## Owner visual correction queue — 2026-10-01

Owner supplied33 browser comments plus loading-theme flash. All recorded in
407-owner-visual-corrections.md. Prior technical checks did not constitute visual
approval. First small correction: visible Exclude menu chevron; next investigate
durable training name in header/resume. No rollout or scheduling change.

## Owner correction1: session display name — 2026-10-01

Saved-training launch was dropping the selected name. Optional launch display
metadata now flows through pilot/commit into existing session-owned resume record
and ordinary/idiom/sentence chrome. It is a launch snapshot, not inferred from
current preset equality or scheduling identity. Existing user/owner isolation and
server-authoritative session restoration stay unchanged. Old records remain valid;
material fallback replaces queue title in approved ordinary chrome, with localized
Current training for dictionary-scope starts. New scope clears the display snapshot.

98 focused tests6files pass; strengthened26 family/resume/chrome checks pass;
additional header override regression11chrome tests passes. Typecheck and targeted
lint pass. No DB/API/scheduler changes. User Settings tab left unchanged during
inspection; no live start/grade submitted. Next correction4 reveal blink.

### 2026-10-01 — correction4 investigation, incomplete

Verified canonical3100 health: local contract193, approved presentation enabled.
Found actual production motion owner `useTrainingPromptReveal` (the older
`usePromptReveal` hook has no callers). Both ordinary and exercise cards use it.
Isolated `/dev/sense-card-gate` renders the real TrainingSenseCardStage against
fixtures, without starting or grading a user session. Opened a temporary IAB tab
and inspected its face/answer control. No production code changed yet.

The motion hook removes its clone and restores target visibility at420ms; approved
CSS independently fades the entire header and answer scroll from opacity0 over140ms.
This is a candidate handoff discontinuity, not yet a confirmed diagnosis. Need an
actual frame trace before changing it. Initial read-only browser sampling failed
because the evaluate scope does not expose performance.now; no trace obtained.
Use documented CDP developer capability or a supported browser timing harness next.
Correction4 remains unchecked. Existing next-env.d.ts generated diff remains unstaged.

### 2026-10-01 — correction4 fixed: continuous prompt handoff

CDP frame trace of the real fixture stage confirmed420ms motion completion removed
the overlay before the140ms parent opacity transition. Three sampled frames had
no overlay and header opacity0. The shared ordinary/exercise motion hook now keeps
the arrived inert clone until target and ancestors reach full opacity, with bounded
RAF cleanup and cancellation/unmount cleanup. No action or scheduling changes.
The existing motion lock ends on arrival; reduced motion bypass remains unchanged.

Regression at the hook seam reproduces the ancestor fade and failed before fix
(expected overlay not null); all6tests pass after fix, including reduced motion,
cancel, unmount and unsupported animation. Typecheck and targeted lint pass.
Original browser scenario repeated:100frames, zero blank frames; overlay persisted
through opacity0→1 then removed. Temporary trace global deleted. Screenshot:
/tmp/407qa/correction4-reveal.png. Next correction5 word details surface/frame.

### 2026-10-01 — correction5 flat outer word article

Reference library CSS flat variant has transparent background, border0, radius0,
shadow none. Shared production article group now matches these outer roles; meaning
cards retain their own surface and border. Training Details approved wrapper loses
extra p-3 that produced a separated inner rectangle. Legacy wrapper untouched.
QA harness previously lacked practice tokens, making shared cards visually invalid;
it now inherits the real light practice theme, without preference writes. Browser
verified transparent group, border0, canvas#f3f4f8, and visible framed meanings.
Screenshot /tmp/407qa/correction5-flat.png. Existing dialog3tests pass; typecheck,
targeted lint and diff pass. No dictionary/actions/scheduling changes. Next6 badges.

### 2026-10-01 — correction6 markers above meaning frames

Shared article surfaces now use exact prototype above-marker geometry: top-20,
ordinal left5, status right8, transparent backgrounds, height16 and margin22/32.
No changed status calculations, ordering, identity or callbacks. Browser fixture
with real theme confirms both marker bottoms207 are above frame top210; screenshot
shows expanded and collapsed meanings and continuous borders. Screenshot:
/tmp/407qa/correction6-above.png. CSS-only change; diff check passes. Next7 chevron.

### 2026-10-01 — correction7 quiet meaning chevron

Shared approved toggle background transparent, shifted8px right/up towards corner.
Retains28px target, focus-visible outline and existing collapse/expand handlers.
Browser verified computed transparent background and transform8/-8; click collapse
and Enter expand succeed, aria-expanded=true. Final settled screenshot saved at
/tmp/407qa/correction7-chevron.png. CSS-only; diff passes. Next8 collections dialog.

### 2026-10-01 — correction8 compact collection picker

Approved picker uses shared localized prototype title/hint and plus creation after
the list. Search retained from reference. Headword/definition context sr-only;
legacy header/form remain unchanged. One shared form preserves real create callback
and pending/membership-read guards. Form appears on demand and focuses its input;
status/error/retry remain visible and server operation ownership untouched.
Browser confirms compact initial picker and creation focus. Screenshot:
/tmp/407qa/correction8-collections.png. Seven tests including creation callback,
loading/failed membership recovery, dialogs pass; typecheck/lint/diff pass.
Next9 visible Word details header removal with accessible name retained.

### 2026-10-01 — correction9 remove visible word-panel title row

Shared approved WordDetailsHeader only renders close control; background transparent
and divider removed. Space for the40px close target remains. PracticePanel retains
localized accessible dialog name; legacy header unchanged. Added real drawer fixture
to existing SenseCard QA harness, no lookup/actions or progress writes. Browser
verified RU panel without visible title/divider and close callback. Screenshot:
/tmp/407qa/correction9-header.png. Strengthened dialog regression checks named
dialog without title text plus animated dismissal; three tests/typecheck/lint/diff
pass. Next10 app header divider.

### 2026-10-01 — correction10 no app header divider

Approved AppFrame header receives explicit headerApproved border-bottom0; legacy
menu header unchanged. Actual owner Settings tab inspected read-only, no navigation
or preferences writes: computed border0, height58px and screenshot match header
composition without line. Screenshot /tmp/407qa/correction10-header.png. AppFrame
tests/typecheck/diff pass. Next33 logo navigation, then2 theme control and34 loading.

### 2026-10-01 — correction33 logo returns to Training

AppFrame logo native button uses existing typed onNavigate(training), same pending
navigationDisabled lock as destinations. Localized accessible label identifies
destination, visible brand dimensions unchanged. Optional BrandLogo span avoids
paragraph inside button, defaults preserve other callers. Unit regression verifies
owner callback and no callback while pending; ten tests/typecheck/lint/diff pass.
Separate browser QA tab navigated Settings→/ with Training overview visible; no
start/grade, owner Settings tab unchanged. QA tab closed after screenshot saved
/tmp/407qa/correction33-logo.png. Next2 theme icon, then34 initial loading.

### 2026-10-01 — correction2 mode-specific theme icon

Reference BuilderPrototype uses Sun(light), Moon(dark), Monitor(system)18px;
approved utility previously always SunMoon. Quiet appearance now uses exact
mode-specific components, retains18px/stroke1.5, labels/tooltip/disabled guard
and existing cycle callback/preference owner. Legacy default SunMoon unchanged.
Actual Settings tab inspected read-only: saved system label and Monitor icon;
no preferences mutated. Screenshot /tmp/407qa/correction2-theme.png. Nine existing
AppFrame tests/typecheck/lint/diff pass. Next34 initial theme/loading flash.

### 2026-10-01 — correction34 investigation, not complete

Authoritative startup inspection identifies two distinct early appearances:
1. HomePage loads auth and general preferences, renders TrainingBootstrapShell
   with full AppFrame(system mode) and framed TrainingPilotStatePanel beforehand.
2. TrainingScreen mounts AccountPracticeAppearanceProvider after that boundary.
   Provider initializes palette lavender, renders children immediately, then
   independently loads practice_palette; selected palette replaces visible default.
   Theme mode applies in TrainingScreenContent useEffect after paint.

No current code change yet; correction34 remains unchecked. Palette repository
withPreferenceDeadline already owns private user_settings lookup, errors and save.
Keep it authoritative. Proposed narrow implementation: common logo/status startup
surface without frame/navigation, hide coloured interface until palette readiness,
preserve visible retry on palette failure; apply saved theme before paint and fade
ready UI with reduced-motion bypass. Verify delayed palette resolution cannot
render lavender controls, failure/retry, initial bootstrap/loading locale behavior,
and actual browser reload sequence. Avoid a second preference store or changing
auth/scheduling owners. Inspect existing HomePage.loading tests and palette provider
consumers before changing mount sequencing (children might own material loading).

### 2026-10-01 — correction34 startup appearance fixed

Approved bootstrap reuses a neutral StartupLogoScreen with logo/plain status and
existing long-running/error/retry state copy, no navigation/frame/Indigo indicator.
Before interface language is known only logo is visible, avoiding invented locale.
Palette provider optional requireReady gate is enabled at real TrainingScreen boundary:
children mount only after server-owned palette load; failure shows localized appearance
error/retry. Existing provider consumers and gate-off path preserve behavior. No
second preference store. Saved account mode applied in layout effect before coloured
interface paint, ready UI fades220ms, reduced-motion disables fade.

Delayed-palette regression proves no lavender controls before selected graphite;
failure/retry and EN/NL/RU logo bootstrap tests, existing appearance/HomePage tests25
pass. Full TrainingScreen run69/70 passed; sole failure was stale pre-correction1
queue-title expectation, updated to existing material-name contract and rerun passes.
Typecheck and focused lint/diff pass. Browser QA separate tab with2000ms network
latency confirmed neutral logo, later saved graphite/system Settings. Network
conditions reset, trace global removed and tab closed. No preferences/session writes.
Screenshot /tmp/407qa/correction34-loading.png. Raw CDP new-document instrumentation
unsupported; no claim of full reload frame trace, readiness tested at real provider seam.
Next11 collection-only scope semantics, then12–15 Library presentation/loading.

### 2026-10-01 — correction11 explicit collection search scope

Library viewedList is activeList or first accessible list. Toggle switches grouped
dictionary search to fetchWordsForList(viewedListId), without collection/progress
mutation. Approved label now names exact collection on EN/NL/RU; absent list hides
control, legacy unchanged. Browser actual VanDale2k scope4031records,20per page.
Grouping19tests/typecheck/lint/diff pass. Screenshot correction11-scope.png.
This actual page revealed a separate Library aside surface still framing the flat
article despite correction5 group fix. Follow-up required before continuing12.

### 2026-10-01 — correction5 follow-up real Library container

Actual DictionarySearchTab aside had its own surface/radius outside shared group.
Removed both in approved workspace CSS; legacy untouched, meaning frames retained.
Actual authenticated browser computed transparent/radius0 and screenshot confirms
flat full article /tmp/407qa/correction5-library-flat.png. CSS-only diff passes.
This closes the fixture coverage gap found during correction11; next12 toolbar.
