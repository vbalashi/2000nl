# Prototype visual consistency and text sizing audit

Date: 2026-09-29. Baseline: `51e04c2521b8903d3a309296d7e519de2bb4a88b`.
Status: review completed; recommendations below are proposed, not implemented.
Owner: UI presentation and reading preferences. No dictionary, scheduling or DB changes.

## Evidence and scope

Three independent Luna High source reviews covered typography/preferences, palette/contrast, and spacing/component reuse. Parent review checked the actual browser cascade and captured eight states. Source findings are not all visual failures: risks and confirmed defects are distinguished below.

Current-run screenshots live in `/Users/khrustal/.codex/visualizations/2026/09/29/type-audit/`:

| Step | Evidence | Result |
| --- | --- | --- |
| Training home | 01-training-home.png | Coherent hierarchy; compact supporting labels need preference coverage. |
| Settings / Large | 02-settings-large.png | Defect: only some preview text grows. |
| Active training after Large | 03-session-after-large.png | Defect: real session typography remains unchanged. |
| Word details panel | 04-word-details.png | Shared article styling is useful, but size preference does not reach it. |
| Recent activity | 05-history.png | Clear hierarchy, but 12–13px supporting text is not scalable. |
| Statistics | 06-statistics.png | Section hierarchy works; compact controls and interactive heatmap need attention. |
| Mobile builder, Exercises open | 07-builder-mobile.png | Baseline wraps acceptably; fixed preview/control geometry needs enlarged-text testing. |
| Mobile Library filters | 08-library-filters-mobile.png | Approved chips layout remains intact; labels need shared sizing. |

Desktop sample: 1024×920. Mobile builder/filters: 430×932. Browser measurements used computed styles, not just declarations. Temporary viewport was reset and text-size selection returned to Medium. No product files changed.

Not performed: exhaustive six-theme visual sweep, 200% browser zoom, 320px reflow, screen reader, OS text enlargement, every language, every interaction state. This is not a WCAG conformance claim. Six palette/mode combinations were inspected through source contrast calculations.

## Confirmed findings

### High: the size preference is a preview-only control

`apps/ui/app/dev/session-builder-prototype/SettingsPrototype.tsx:27` initializes phone/desktop settings locally. The change callback is a no-op for persistence. Preview variables do not propagate to training, library, history or dialogs. Reload resets the local choice.

Measured Medium → Large in Settings:

| Role | Medium | Large |
| --- | --- | --- |
| Headword | 36px | 36px |
| Definition | 20px | 20px |
| Emphasized translation | 14px | 14px |
| Example | 18px | 20px |
| Example translation | 16px | 18px |

Measured active training after switching Large and back to Medium: identical typography. Headword 44px, definition 20px, literary example 16px, nested explanation 13px, rating label 14px. History: word 16px, mode/time 12px, result 13px.

The raw library stylesheet contains earlier 14px definition declarations, but the final browser cascade renders the approved definition at **20px Newsreader**. Do not use the earlier declaration as the actual visible size.

### High: two typography/preference systems need one owner

The prototype uses fixed semantic sizes in `components/practice/ui/practiceTheme.module.css`. Production has `lib/reading/readingSize.ts` and `components/reading/ReadingPreferencesProvider.tsx`, including per-device persistence. Extend that ownership rather than adding a third store. Existing reader sizes also grow unevenly: body 16/18/20, translations 13/14/15, face headword 48/50/52. Some production consumers still use fixed utility sizes.

Two loaded families are appropriate: Inter for interface, Newsreader for dictionary reading. Twelve base size tokens (11–44px) are not inherently excessive; the problem is missing semantic coverage and disconnected scaling, not the number of fonts.

### Medium: Easy hover contrast misses the normal-text threshold

`components/practice/ratingControls.module.css` pairs info-colored text with surface-hover. Calculated contrast: Lavender light **4.40:1**, Graphite light **4.34:1**, Blue light 4.58:1; dark variants at least 5.92:1. Normal background is adequate (at least 5.62:1). Adjust the text/hover pairing and test the actual component state, not only generic palette pairs.

Existing theme tests omit this combination. Disabled opacity differs (.4/.45); ratings have no explicit disabled style. These are consistency concerns, not asserted contrast failures. Decorative rails and low-contrast borders are not automatically text-contrast defects. Selected state must be assessed with all its cues.

### Medium: spacing has accidental overrides and little shared ownership

`wordDetails.module.css:13–14` declares `.body` padding twice, with the second silently winning. Remove the obsolete declaration while preserving the accepted appearance.

Source inventory across prototype/practice styles found 1,470 numeric spacing/inset occurrences (246 property/value pairs), 238 radius occurrences (30 values), and 70 line-height occurrences (18 values). These include responsive and experimental variants; they are **not** counts of defects or distinct visible distances. Existing color/type/radius tokens are a useful foundation, but margins, padding and gaps are mostly independent literals.

The style audit script checks colors/font sizes/families, not spacing, duplicate declarations, interactive heights or clipping combinations. Several prototype stylesheets are outside its strict guard scope.

### Medium: enlarged text needs flexible controls

Statistics tab controls have a fixed 26px height. Shared icon actions can be as small as 24px. Interactive heatmap cells are smaller still. Rating controls calculate a pixel height and hide overflow: this is a clipping risk to test, not a reproduced defect at the current baseline.

Use 44px as a proposed product target for touch areas, independently of visual button height; do not call every sub-44px control a WCAG AA failure. Dense heatmaps need an accessible alternative such as day selection/list navigation rather than overlapping invisible hit areas.

## Recommended product decision

Start with **one global Text size control, four positions: A / A+ / A++ / A+++**. Preserve the current elongated segmented presentation and the current appearance at A. Add accessible names such as “Standard”, “Larger”, “Large”, “Extra large”; announce the selected value and support keyboard selection.

One setting prevents a user from enlarging a card while leaving Settings, history and navigation unreadable. Internally use separate semantic coefficients. A separate optional reading adjustment can be added later if user testing establishes a need; two mandatory controls are not necessary initially.

Four positions provide the baseline plus three meaningful increases. Three can cover too little range or force large jumps. A fifth compact option adds little for the stated low-vision goal; add it only for an established compact-layout use case.

Proposed starting coefficients, **not yet validated in the layout**:

| Text role | A | A+ | A++ | A+++ |
| --- | --- | --- | --- | --- |
| Definitions, examples, explanations, translations, forms | 100% | 125% | 150% | 200% |
| UI labels, controls, metadata, history details | 100% | 115% | 130% | 150% |
| Already-large headwords/display numerals | 100% | 108% | 118% | 130% |

Examples: a 44px training headword becomes approximately 48/52/57px; a 20px definition becomes 25/30/40px; a 13px translation becomes approximately 16/20/26px; a 14px interface label becomes approximately 16/18/21px. Keep subpixel values in CSS if useful, rather than rounding every role independently.

Apply the same reading coefficients in Library and the three-dot panel. Their base headword can remain smaller (36px vs 44px); do not weaken the user's reading preference just because the container is compact. A definition or translation used as a face prompt belongs to reading content, not the slow-growing headword role. Article labels remain visually subordinate but also grow. History text must grow through UI roles; any full dictionary content shown there uses reading roles.

Translations should not grow more slowly than the surrounding examples merely because they begin smaller. Preserve color hierarchy without making essential answers look like helper text.

## Layout and implementation boundaries

1. Define semantic reading, UI, display and leading roles in one scale module; bridge existing reader variables and practice theme tokens. Reuse the existing preferences provider/repository. Explicitly migrate stored three-value preferences if the contract changes; do not silently normalize a previous large choice to standard.
2. Keep the current default visually unchanged. Route Settings preview and real screens through the same components and scale, so the preview is truthful. Retain existing phone/desktop preference behavior; resizing a window must not reset the choice.
3. Add spacing roles for source→translation, content block separation, section separation, control gap, card/dialog inset. Use a small base scale (4/8/12/16/24/32) with explicit exceptions for accepted 6/10px details. Do not replace every number mechanically: decorative rails, optical offsets, charts and animation geometry have different purposes.
4. Use relative leading and pair gaps where tied to text. Keep source/translation pairs closer than unrelated blocks. Avoid scaling all whitespace with font size; existing generous space can absorb growth.
5. Treat 46px training buttons and 28px compact buttons as baseline visual sizes/minima, not immutable caps. Grow height or wrap when necessary. Preserve practical hit areas. Never shrink chosen font sizes to force a single row.
6. Keep training actions reachable. At extreme text sizes or short viewports, allow a constrained pinned word area to reflow/scroll rather than starving the content viewport. Long words must wrap. Dialogs must scroll and retain access to close/apply actions.
7. Extend style inventory and focused tests: duplicate declarations, fixed-height plus overflow combinations, semantic spacing reuse, actual contrast pairings including hover. Allow documented optical exceptions. Do not ban a value merely because it occurs once.

## Acceptance checks for implementation

- All four settings visibly affect Settings, home, builder, both training faces, Library, word details, history, filters and statistics.
- Reload/navigation persistence; phone/desktop independence; legacy preference migration.
- Long definitions/translations/forms and rating labels in supported locales; 320/390/430/768/1024px widths and short landscape height.
- Browser zoom through 200%, reflow and user text-spacing overrides, keyboard focus, reduced motion. Test these separately from the in-app preference.
- Light/dark Lavender, Blue and Graphite; normal/hover/selected/focus/disabled states.
- No clipped text, inaccessible actions, accidental double scaling or default appearance regression.

WCAG permits browser zoom to satisfy text resizing, but text and controls must remain usable up to 200%; the proposed differentiated in-app coefficients alone do not establish compliance. See [Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html), [Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), and [Text Spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html).

## Implementation checkpoint — 2026-09-29

Applied for owner browser review in the prototype:

- Renamed the control to **Text size**, four accessible segmented buttons A/A+/A++/A+++.
- Shared presentation scale in `apps/ui/lib/reading/textScale.ts`; prototype root supplies UI, display and reading roles to all descendants, including native dialogs. Settings uses the same article rendering and no separate preview size overrides.
- Local preview persistence adapter reuses device detection and stores phone/desktop independently. Production three-value account preferences and DB remain untouched: rollout still requires an explicit contract migration and provider integration. No claim that these four choices are saved to the account.
- Mapped definitions, translations, examples, explanations, forms and builder samples to reading roles. UI/history use the gentler UI scale, headwords the display scale.
- Corrected light-theme info/hover contrast and added all four rating hover pairings to the palette tests.
- Removed duplicate forms padding, introduced shared pair/content/section spacing, made compact text line heights relative, removed fixed statistics tab height. Style inventory now includes spacing/height/radius/leading properties; these are reported rather than blindly forbidden.
- Bounded training prompts remain scrollable when large, actions stay visible; narrow Library filter rows and footer reflow without hiding Reset.

Validation: typecheck, selected prototype/practice lint and style guard passed; 37 tests passed across six suites, including persistence/remount and role scale tests. Browser: four steps at 430px with no horizontal overflow; A+++ training at 430×932 and 320×640, two-row ratings at 320, word-details panel, Settings, Library filters, and reload persistence. Screenshot: `/Users/khrustal/.codex/visualizations/2026/09/29/text-size-applied.png`. Browser viewport reset; review tab left at A+.

Still separate from this checkpoint: full browser zoom/text-spacing matrix, exhaustive all-theme/all-locale visual QA, production preference migration, and heatmap keyboard/touch redesign. Existing local health warnings (DB contract / pending grouped-search index) limit live-data QA; browser checks used prototype samples.
