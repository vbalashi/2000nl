# Controls standard

Owner decisions: 2026-10-06. Tracking: [#596](https://github.com/vbalashi/2000nl/issues/596).
Status: control defaults selected; Session Builder visual review pending. No production migration in this checkpoint.

## Geometry and selection

| Family | Height | Outer corner radius | Group background | Border |
| --- | --- | --- | --- | --- |
| Training / Library / Statistics navigation | 34 px | 40% = 13.6 px | Yes | No |
| Period, statistics languages, material language, builder languages, appearance, spacing, text size, translation | 28 px | 40% = 11.2 px | No | No |
| Learning languages selector | 28 px | 40% = 11.2 px | No | No |
| Primary Start training / wide Start learning | 44 px | 30% = 13.2 px | Action fill | No |
| Save changes + menu / Start training in Session Builder | 44 px, equal width | 30% = 13.2 px | Secondary / primary action fill | No |
| Delete training in Session Builder | 34 px | 30% = 10.2 px | Transparent; trash icon + label | No |
| Library dictionary-card service actions | 28 px, fixed | 30% = 8.4 px | No group fill | No |

The percentages are relative to control height, not width. Retain 44 / 34 / 28 as explicit size variants. Do not replace intentionally wide launch actions with content-width controls everywhere.

Only top navigation has a persistent group background. Other choice groups have transparent unselected buttons and a soft, theme-specific fill behind the selected item. No colored selected border and no vertical dividers. Primary, secondary and destructive action fills remain separate from group backgrounds.

Move the selected capsule with transform and size transitions over 230 ms, using cubic-bezier(.22,1,.36,1). Respect reduced motion. Reposition without animation on resize. Use actual label measurements; support translated labels and text size profiles. Compact visual height must not reduce touch hit targets or create overlapping targets.

Use existing appearance palette tokens; introduce semantic neutral menu-border and muted destructive-action variants rather than hardcoding one palette into production. Dropdown radius is 12 px; its border mixes 12% foreground into its surface. Verify contrast, menu opacity, focus, disabled/loading states and muted Delete in every production palette. Preserve visible keyboard focus even though resting borders are removed.

## Language selection

Translation: Off / remembered language / separate chevron. Selecting Off disables translation while retaining the language. Clicking the remembered language enables it. Choosing from the dropdown replaces the remembered label and enables it. The chevron has no background, frame or selection fill.

Learning languages: render active, unpaused languages only, in settings order. Show as many labels as fit, at most four. If all fit, no chevron. If more remain, reserve the last visible slot for the remembered selection and show a separate unfilled chevron. Picking an overflow language places it in that final slot and selects it; the earlier slots retain settings order. Resizing must keep the selected language visible. A single active language is shown alone, even if other languages are paused. Zero active languages needs the existing empty-state/add-language flow, not an invented active selection. This selector must not implicitly resume paused languages or overwrite language statuses.

Your material: All means all material languages, Current language follows the application's current training language, and a remembered explicit language is selectable through a separate chevron. Only one mode is selected. Where one available language makes all modes equivalent, omit redundant choice controls. Language scope is independent of material type (Vocab / Dictionary); do not silently remove existing type filtering while applying this language selector.

## Session Builder review

Use the Training overview's 720 px content width, including sections and footer. The back arrow may sit outside this alignment on desktop, inside the header on small screens. Keep the overview's Newsreader training title (36 px) and a modest Inter Session builder heading (20 px). Training name appears as text with a pencil; editing is explicit.

Delete training is an unfilled muted destructive action with a trash icon and label on the left, available only for a saved training. Save changes and Start training have the same height (44 px) and equal visual widths (168 px on desktop, equal responsive columns on narrow screens). Save changes and its chevron share one continuous secondary fill and outline shape, with no divider. The label saves directly; the chevron opens the Save as new training menu. Keep these as distinct accessible actions within one visual control. Save changes updates that saved recipe; Save as new training is a separate menu action. Start training launches the edited parameters. Preserve the authoritative session lifecycle; this visual decision does not authorize changing persistence or DB behavior. For a new recipe use Save training, not Save changes. Retain discard/unsaved-change and deletion confirmation behavior where required.

Remove Set as main training: an explicit start makes it current. Remove unrelated Checking your saved session and reset-on-another-device prose from this builder. Necessary loading and failure states should attach to their actual action, not display unexplained status text. The mockup has local preview actions, not actual data mutations.

The existing section surfaces remain: “no background” applies to control groups, not to the Language / Source / Exercises / Filters / Session blocks.

## Protected controls and rollout boundary

Again / Hard / Good / Easy are approved and excluded from this migration, including their colors, left markers, radii, widths and adaptive layout. This exclusion applies inside Library as well as Training.

Dictionary-card actions use a separate 28 px family; do not inherit 44 px Start learning just because their label matches. Preserve primary learning action vs quiet collections/overflow hierarchy.

Do not use global button, role=button, or shared CSS selectors as a migration mechanism. Map each component to a named family, migrate Session Builder first after visual approval, then review each remaining page. Existing SegmentedControl is only a wrapper; it does not yet implement this standard or capsule animation.

## Inventory gate before application

Known locations to review in apps/ui:

- practice/ui/SegmentedControl and per-page consumers: shell navigation, Statistics period/languages, settings appearance/text/spacing, Library material types/languages, builder chips.
- practice/builder/* and SavedTrainingControls: save/update/start/delete/overflow, saved row status and accordion chevrons.
- practice/settings/LanguagePicker and settings language status rows: translation selectors, learning selector, active/paused actions and language management. Do not restyle a status mutation as a single-selection tab.
- practice/article/articleActions.module.css and training/library-v2/LibraryMeaningActions: compact learning/undo, collections and overflow; ratings excluded.
- practice/ui/ActionMenu, IconAction, AddAction, library/LibraryFilters, AccountLibraryFilters, NounFilterPopover: popovers, icon-only triggers, add actions and filter chips require explicit variants.
- Dialogs, sheets, confirmations, card reveal/audio/report/known/exclude controls, pagination, auth, premium/account and admin actions: not yet individually approved; inventory before widening scope.
- Native checkboxes, switches, input fields, selects and links are not automatically replaced by capsule buttons.

Verification per slice: inventory call sites and CSS imports; inspect default/selected/hover/focus/disabled/loading/destructive states; test keyboard and Escape/outside-close; check 320 px, desktop, long translated labels, appearance palettes and text/spacing profiles; assert untouched rating/card families. Completion cannot be claimed from a broad CSS replacement.

## Durable playgrounds

See [controls-2026-10](../design/controls-2026-10/README.md). Keep approved defaults distinct from exploratory settings. The mockups are design evidence, not production component code.

## Source fidelity gate

Session Builder prototypes must use the existing ApprovedTrainingBuilder section bodies and TrainingTodaySetup selection callbacks. Do not invent checkbox exercises or new type/direction options. Exercise family is single choice; directions (Words/Idioms), selected dictionaries and part-of-speech filters have their existing multi-selection rules. Session size/mix stay sliders. Direction examples, disabled typing, noun/article/activity filters and save-as/delete dialogs come from their current components and locale catalogs. Visual controls must preserve these semantics. See the source-backed review adapter for exact scope and fixture limitations.
