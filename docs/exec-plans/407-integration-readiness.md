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
