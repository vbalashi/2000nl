# Practice presentation: theme and integration contract

Checkpoint: 2026-09-29, #407, `codex/407-builder-prototype`. This is the shared presentation foundation for the approved preview; it is not a release of the production training routes. See the [audit and rollout gates](../../../docs/exec-plans/407-frontend-hardening.md).

## Ownership

`components/practice/ui/practiceTheme.module.css` owns palette values and type roles. Apply its `theme` class to a screen root, with `data-practice-palette="lavender|blue|graphite"` and the **resolved** `data-colour-mode="light|dark"`. Palette and colour mode are independent preferences. Theme previews use the same contract rather than copied swatch colors.

`usePracticeAppearance` supplies validated local preferences and observes System mode changes. The prototype owns its storage key (`2000nl-preview-appearance-v1`). It does not update account preferences. For production SSR, the app shell must supply the account/device preference before first paint; the current local preview restores after hydration and may briefly paint the default palette. Do not hide this behind hydration-warning suppression.

## Typography

Two font roles: UI uses the existing Inter font variable; dictionary headwords, examples and the Training title use the existing Newsreader variable. System/Georgia names are fallbacks, not extra downloaded fonts. Legacy app documentation and unrelated production routes may still use other typography; this contract is scoped to the approved practice presentation.

| Role | Base size |
| --- | --- |
| label / caption / small | 11 / 12 / 13 px |
| body / body-lg / lead | 14 / 16 / 18 px |
| title-sm / title / page | 20 / 24 / 28 px |
| number / headword / display | 32 / 36 / 44 px |

Choose roles by purpose. Card size preferences may scale these roles. Avoid new one-off pixel sizes or additional font families. Numeric summaries use tabular figures. Eleven-pixel text is reserved for secondary metadata, not primary reading content.

## Color roles

Six configurations share one semantic interface: Lavender, Blue and Graphite, each Light and Dark. Screens use surface/canvas/hover, text/secondary/muted, selected/selected-text, accent/on-accent, border/control-border/focus, status pairs and dictionary annotation rails. Statistics intensity has its own activity scale. A new theme changes values in one file rather than adding screen-specific dark overrides.

Text contrast is checked against all supported canvas, surface and hero endpoints (4.5:1); focus against primary surfaces (3:1); accent, selected and status combinations are also checked. These tests do not certify the entire rendered app, opacity/disabled text, all borders, or assistive technology behavior. Preserve non-color cues: labels, checks, selected states and icons.

## Shared components

- `TrainingOverview` takes a loading/error/ready presentation model and ID-based callbacks. It imports no prototype data, computes no scheduling and knows no database schema. Missing statistics display `—`, not invented zeros. A resume session has its own ID and takes priority over main training. An absent main ID does not hide saved items. Launch availability comes from the caller.
- `DialogSurface` owns native top-layer opening, nested page scroll locks, Escape delegation, actual backdrop clicks and focus restoration. Render it conditionally within the theme root. Supply an accessible label; child screens may use `onCancel` for Back. Do not duplicate lifecycle effects in callers or portal a dialog to an unthemed body.
- `IconAction` requires an accessible label and defaults to `type="button"`. Actual targets must remain at least 24 px, preferably 44 px on touch; do not overlap invisible enlarged hit regions.

Preview adapters (`TrainingHome`, fixtures, variations, saved-training demonstration controls) remain under `app/dev`. Shared presentation must never import from that directory. Library, Settings and Builder still need domain-sized extraction with behavior characterization as their production adapters are introduced; do not copy the broad prototype orchestrator into a production route.

## Verification

From `apps/ui`:

```sh
npm run audit:practice-styles
npm run check:practice-styles
npx vitest run tests/practiceTheme.test.ts tests/practiceAppearance.test.ts tests/practicePresentation.test.tsx tests/TrainingOverview.test.tsx
npm run typecheck
```

The audit counts literal CSS spellings, not simultaneous on-screen colors or loaded fonts. The guard covers shared presentation and the active preview styles. The explicitly retained `comparison.module.css` and `palette.module.css` experiments are excluded; the Radix comparison can retain its `--default-font-family` token. Do not import those experiments into production.

## Approved preview recipe

The canonical approved Library recipe is `app/dev/session-builder-prototype/libraryStudy.ts` → `studyDefaults`. In particular, **filterLayout is chips** (confirmed 2026-09-29), wordDetails is primary and the editorial forms rendering is fixed. All other current defaults match the owner's supplied Training URL. `readStudy` accepts explicit valid URL overrides for design comparisons; an old link with `filterLayout=rows` intentionally opens that comparison. A plain URL must use the approved defaults. Production extraction should consume the approved recipe, not recover choices from browser history or the last QA URL.

Mobile navigation uses one surface for the bar and transparent inactive buttons; only the current destination has a subtle selected background. Statistics section titles share the title-sm role (lead on mobile); Streaks & highlights labels the mixed streak/best-day/average group. Builder disclosure content stays clipped for the entire 440 ms expansion, including the open state; nested native dialogs stay in the top layer. Reduced-motion preferences still disable the transition.

## Training session preview (2026-09-29)

The Training home and Builder launch an interactive session instead of the old placeholder dialog. A frameless session header aligns a completed/total counter, Recent activity and close controls above the full-width progress track. Progress advances only after an explicit rating. Revealing/comparing, translating, reading the dictionary or opening history does not record a review.

Mobile practice hides the app header and primary bottom navigation; answer controls occupy the bottom of the viewport. Desktop keeps app navigation. Closing or navigating away retains one in-memory session; Continue training restores the card, reveal state, typed answer and scroll position. A new launch replaces the previous demo run; refreshing the page resets demo activity and progress.

`PracticePanel` is a shared themed, native-modal secondary destination: right-side panel on desktop, nearly full-height sheet on mobile. It uses `DialogSurface` for focus restoration, Escape and scroll locking. Recent activity has entry points beside session progress and below Activity in Statistics. Both read the same preview action list, grouped by date, across sessions. Empty activity and completed-session states are included.

`LibraryArticle` now accepts an embedded presentation and a read-only action mode. Training uses that exact component, its forms/relations/content renderers and approved `studyDefaults`, not a duplicated dictionary card. Its header remains fixed while meanings scroll; existing overflow gradients remain available. Learn/collection/review mutations are omitted within the training lookup, so reading does not accidentally create a second grading path. The article has one close control.

### Integration boundaries and known limits

- `sessionPreviewModel.ts`, `TrainingSessionPrototype`, RecentActivity and their fixture state are dev-only. Fixed Dutch dictionary samples illustrate word/idiom/English-to-Dutch sentence modes; they do not implement language/source/POS eligibility, FSRS ordering or translation generation. Typed answers are compared visually and self-rated, not automatically marked correct. Audio still reports its disconnected preview state; missing fixture translations remain missing.
- Production must consume real exercise presentations, session identities and action results. Do not transplant the fixture queue or advance durable progress before a successful action response. Preserve failed-write/retry/idempotency behavior from the working runtime.
- Production history currently exposes the most recent 50 actions within 24 hours. Keep that scope accurately labelled on integration; the seeded prototype dates demonstrate grouping, not newly implemented server pagination. Older-history date filters/pagination remain separate API work.
- Persisted resume, app reload/recovery, mobile Back behavior, Report/Exclude, all exercise-family capabilities and screen-reader verification remain integration checks; the preview does not replace these working production flows.
- Typography/colors use the shared practice roles, including rating status colors. Both new stylesheets are covered by `check:practice-styles`.

Verified: six new session tests (grading-only progress, pause/typed/reveal retention, read-only article return, completion, history/empty state, direction examples), 31 focused tests total, typecheck, targeted lint and semantic style guard. Browser checks used the in-app browser at desktop and 430×932: grade, history from both entry points, resume, article scrolling with fixed header, Graphite light/dark. Evidence: `/Users/khrustal/.codex/visualizations/2026/09/29/training-session-preview/`.

Local health reported database-contract incompatibility and an unbuilt grouped-search index. Fixture UI verification does not validate live DB integration. No DB modifications were made.

### Session refinements — 2026-09-29

- `WordIdentity` is shared by the training headword (question and reverse answer) and LibraryArticle. The article inherits the reading family at 0.55 of the word size, regular weight and muted color. It remains part of the accessible heading text.
- Definitions now default to Newsreader at the shared title-sm role (20 px, 1.4 line-height), both in the exercise and full dictionary article. Training Variations offers the previous compact Inter/body treatment for comparison. Examples/expressions and lexical relations share the reading size (16 px), italic style, line height, content inset and neutral secondary text; colored rails/icons identify content kinds.
- `RatingControls` is a shared component. Default: colored text, left stripe, 28 px visual height. Minimum click/touch height remains 44 px. The probe measures the actual localized labels with the actual font and switches the entire group from four to two columns when they no longer fit. No ellipsis or reduced font size. Labels come from the existing English/Dutch/Russian training copy. A forced two-column option is available.
- Training Variations can compare 28/34/46 px visual height, colored/neutral text, left/bottom stripe, automatic/two-column layout and EN/NL/RU labels. These are local per-run design comparisons; the source defaults retain the agreed left/colored/slim presentation.
- PracticePanel now travels from outside the viewport: from the right on desktop, from below on mobile. Enter 460 ms, exit 320 ms; the backdrop fades separately. Dismissal keeps the native modal alive until the exit finishes, then restores the invoking focus. Reduced-motion preference dismisses immediately. Both history and word details use this path, including the article's own close control and Escape.
- No aggregate New/Review/Total strip was added to the session footer. The header reports session completion; broader activity belongs in Statistics.

Validation: 37 focused tests, typecheck, targeted lint and theme style guard. Browser checks: desktop plus 430×932 and 320×740. At 430 px, English/Russian labels fit four columns and Dutch selects two; at 320 px English/Russian select two without overflow. Visible 28 px controls retain 44 px touch targets. Dictionary relations and expressions were measured with identical 16 px Newsreader / 22.4 px line-height, matching rail/text inset and section headings. Both enter and exit directions/durations were verified. Screenshots: `/Users/khrustal/.codex/visualizations/2026/09/29/session-refinements/`.

Concrete local DB evidence is tracked separately in [local QA contract debt](../../../docs/tech-debt/local-qa-contract-2026-09-29.md). Missing deployment ledger and empty grouped-search index are distinct; neither was changed by this UI task.

### Bounded cards and sequenced reveal — 2026-09-29

- Active practice uses one viewport on desktop and mobile, including launches from Builder. App navigation (desktop), session chrome, card metadata/actions, word identity and grading remain outside the answer scroller. `LibraryMeaningViewport` supplies the same scroll boundaries and edge cues used by Library. In reverse word practice the revealed word stays pinned and the question/definition lives below it in the scroller.
- Headword translation is grouped with word identity; definition translation belongs directly below the definition. Shared example/usage translation gaps are 2 px. Word-form fact rows align labels and values on their baseline.
- `usePromptReveal` captures the question's position before reveal and moves it to the answer layout in 420 ms; secondary details fade in afterwards. It works for a word, reverse definition and translation sentence. Grading is disabled during movement; reduced motion skips it. Replaced question nodes regain keyboard focus without scrolling.
- `PracticePanel.onEntered` runs once on the panel's own animation completion, ignoring descendant/backdrop animations; reduced motion completes immediately. Training mounts LibraryArticle collapsed, then passes the current meaning identity. Only that meaning expands; the article viewport aligns it. Subsequent manual disclosure remains possible. Closing before entry completes does not trigger expansion.
- The fixture queue now includes later senses on subsequent sample cycles. This is explicitly sample behavior, not a production scheduler change.

Validation: 20 focused component tests, typecheck, targeted lint, semantic style guard. Tests include third-sense targeting after panel entry, no expansion from child animations, manual collapse, translation ownership in both directions, grading during motion and reduced-motion entry. Browser checks at 1024×920, 430×932 and 320×568: long `goed`, scrolling while word/buttons stay fixed, forms baseline, reverse question, sentence translation, and launch from Builder. On 320×568 the two-row ratings ended at y=556 with the answer independently scrollable; page width/height stayed 320×568. React 18 test harness still warns about the existing boolean `inert` pattern; production uses React 19. Evidence: `/Users/khrustal/.codex/visualizations/2026/09/29/session-layout/`. No database changes or deployment.

### Rating density and secondary actions — 2026-09-29

The approved session default is now adaptive: 46 px visual buttons when all four labels fit one row, 28 px in two rows, with at least 44 px touch targets. Show/compare answer uses 46 px. Variations retains explicit size overrides. Library controls keep their independent compact sizing.

Session footer places quiet Report and Exclude actions on opposite edges. Exclude reuses `CardActionMenu` with Report omitted, offering Exclude and Mark as known. Library keeps the same three-action menu (Exclude, Mark as known, Report), with Collections on the left. Both surfaces reuse `CardReportDialog`; the prototype does not submit reports. Training lookup remains read-only as previously agreed.

Prototype marks distinguish known/excluded per sense and exercise family, allow Undo before Next card, suppress grading while marked, and record a distinct demo activity result when proceeding. They survive pause within the current in-memory run. They are not production exclusion/known APIs or a production queue filter: adapters must preserve actual target scope and durable undo/idempotency semantics.

Validation: 22 focused tests passed; typecheck, targeted lint and theme guard passed. Browser: 1024×920 single-row visual height 46; 320×740 two rows with 28 px visuals / 44 px hit targets; anchored two-item menu, known/undo and separate Report dialog. Screenshots: `/Users/khrustal/.codex/visualizations/2026/09/29/session-actions/`.
