# Controls standard

Owner decisions: 2026-10-06. Tracking: [#596](https://github.com/vbalashi/2000nl/issues/596).
Status: Session Builder approved and implemented in application code. Local component QA completed; account smoke limited by local DB contract mismatch (208 vs 211). Shared choice controls now cover Appearance, spacing, text size, translation, Statistics period/languages/material, and Library filter chips. Saved-training lists have symmetric scroll indicators; Builder confines scrolling to its viewport.

## Geometry and selection

| Family | Height | Outer corner radius | Group background | Border |
| --- | --- | --- | --- | --- |
| Training / Library / Statistics navigation | 34 px | 40% = 13.6 px | Yes | No |
| Period, statistics languages, material language, builder languages, appearance, spacing, text size, translation | 28 px | 40% = 11.2 px | No | No |
| Learning languages selector | 28 px | 40% = 11.2 px | No | No |
| Primary Start training / wide Start learning | 44 px | 30% = 13.2 px | Action fill | No |
| Session Builder Save changes + menu | 28 px, compact right aligned | 40% = 11.2 px | Transparent | Neutral outline |
| Delete training in Session Builder | 34 px | 30% = 10.2 px | Transparent; trash icon with accessible label | No |
| Library dictionary-card service actions | 28 px, fixed | 30% = 8.4 px | No group fill | No |

The percentages are relative to control height, not width. Retain 44 / 34 / 28 as explicit size variants. Do not replace intentionally wide launch actions with content-width controls everywhere.

Only top navigation has a persistent group background. Other choice groups have transparent unselected buttons and a soft, theme-specific fill behind the selected item. No colored selected border and no vertical dividers. Primary, secondary and destructive action fills remain separate from group backgrounds.

Move the selected capsule with transform and size transitions over 230 ms, using cubic-bezier(.22,1,.36,1). Respect reduced motion. Reposition without animation on resize. Use actual label measurements; support translated labels and text size profiles. Compact visual height must not reduce touch hit targets or create overlapping targets.

Use existing appearance palette tokens; introduce semantic neutral menu-border and muted destructive-action variants rather than hardcoding one palette into production. Dropdown radius is 12 px; its border mixes 12% foreground into its surface. Verify contrast, menu opacity, focus, disabled/loading states and muted Delete in every production palette. Preserve visible keyboard focus even though resting borders are removed.

## Language selection

Translation: Off / remembered language / separate chevron. Selecting Off disables translation while retaining the language. Clicking the remembered language enables it. Choosing from the dropdown replaces the remembered label and enables it. The chevron has no background, frame or selection fill.

Learning languages: render active, unpaused languages only, in settings order. Show as many labels as fit, at most four. If all fit, no chevron. If more remain, reserve the last visible slot for the remembered selection and show a separate unfilled chevron. Picking an overflow language places it in that final slot and selects it; the earlier slots retain settings order. Resizing must keep the selected language visible. A single active language is shown alone, even if other languages are paused. Zero active languages needs the existing empty-state/add-language flow, not an invented active selection. This selector must not implicitly resume paused languages or overwrite language statuses.

Your material (final owner clarification): All means all enabled readable dictionaries/material in the language selected above. A second, remembered specific dictionary or collection is selectable directly; its separate unfilled chevron opens the full material list. Omit the redundant Current language option. Keep statistics requests scoped to one language; do not aggregate across languages. Only one material scope is selected. Existing material identities, access and counts stay server-owned.

## Session Builder review

Use the Training overview's 720 px content width, including sections and footer. The back arrow may sit outside this alignment on desktop, inside the header on small screens. Keep the overview's Newsreader training title (36 px) and a modest Inter Session builder heading (20 px). Training name appears as text with a pencil; editing is explicit.

Selected footer B: Start training is first, full content width, 44 px. Beneath it, a transparent trash icon sits left; Save changes and its chevron form one compact right-aligned 28 px control with a neutral outline and no divider. The two actions remain separately accessible. A small accent dot appears beside Save changes when name, language or recipe values differ from the saved recipe. Successful Save or Save as establishes the new baseline; failed saving keeps the dot, and restoring the original values removes it. Selection array order does not count as an edit. Save changes updates the saved recipe; Save as creates a separate recipe; Start launches the draft without implying that edits have been saved. New recipes use Save training. Preserve deletion confirmation and authoritative persistence/session behavior.

Remove Set as main training: an explicit start makes it current. Remove unrelated Checking your saved session and reset-on-another-device prose from this builder. Necessary loading and failure states should attach to their actual action, not display unexplained status text. The mockup has local preview actions, not actual data mutations.

Session Builder uses the approved shared transparent frame and inset section dividers. Hover fills only the disclosure header, without changing geometry.

## Protected controls and rollout boundary

Again / Hard / Good / Easy are approved and excluded from this migration, including their colors and left markers; Training also retains its radii, widths and adaptive layout. Training keeps this geometry. The owner-approved Library exception (2026-10-06) uses 28px compact ratings with the same colors and left markers.

Dictionary-card actions use a separate 28 px family; do not inherit 44 px Start learning just because their label matches. Preserve primary learning action vs quiet collections/overflow hierarchy.

Do not use global button, role=button, or shared CSS selectors as a migration mechanism. Map each component to a named family, migrate Session Builder first after visual approval, then review each remaining page. SegmentedControl implements the standard through its explicit `standard` variant and useSelectionMarker.

## Inventory gate before application

Known locations to review in apps/ui:

- practice/ui/SegmentedControl and per-page consumers: shell navigation, Statistics period/languages, settings appearance/text/spacing, Library material types/languages, builder chips.
- practice/builder/* and SavedTrainingControls: save/update/start/delete/overflow, saved row status and accordion chevrons.
- practice/settings/LanguagePicker and settings language status rows: translation selectors, learning selector, active/paused actions and language management. Do not restyle a status mutation as a single-selection tab.
- practice/article/articleActions.module.css and training/library-v2/LibraryMeaningActions: compact learning/undo, collections and overflow; Library ratings use the separately approved compact size.
- practice/ui/ActionMenu, IconAction, AddAction, library/LibraryFilters, AccountLibraryFilters, NounFilterPopover: popovers, icon-only triggers, add actions and filter chips require explicit variants.
- Dialogs, sheets, confirmations, card reveal/audio/report/known/exclude controls, pagination, auth, premium/account and admin actions: not yet individually approved; inventory before widening scope.
- Native checkboxes, switches, input fields, selects and links are not automatically replaced by capsule buttons.

Verification per slice: inventory call sites and CSS imports; inspect default/selected/hover/focus/disabled/loading/destructive states; test keyboard and Escape/outside-close; check 320 px, desktop, long translated labels, appearance palettes and text/spacing profiles; assert untouched rating/card families. Completion cannot be claimed from a broad CSS replacement.

## Durable playgrounds

See [controls-2026-10](../design/controls-2026-10/README.md). Keep approved defaults distinct from exploratory settings. The mockups are design evidence, not production component code.

## Source fidelity gate

Session Builder prototypes must use the existing ApprovedTrainingBuilder section bodies and TrainingTodaySetup selection callbacks. Do not invent checkbox exercises or new type/direction options. Exercise family is single choice; directions (Words/Idioms), selected dictionaries and part-of-speech filters have their existing multi-selection rules. Session size/mix stay sliders. Direction examples, disabled typing, noun/article/activity filters and save-as/delete dialogs come from their current components and locale catalogs. Visual controls must preserve these semantics. See the source-backed review adapter for exact scope and fixture limitations.

Owner selection: Session Builder uses one shared frame with inset section dividers. On all widths, Start training fills the first row; the transparent trash icon and compact outlined Save changes share the second row (selected footer B). The icon retains its localized accessible Delete training label and confirmation. The alternative gap layout remains available in the prototype for comparison.

Builder name typography matches Training overview hero: reading font, weight 500, 36px desktop / 29px mobile / 26px short viewport, line-height 1.1, letter-spacing -1px. Implemented overview ↔ builder transition: same 720px content width, stable top navigation, outgoing content opacity 1→0 and y 0→-8px over 100ms, incoming opacity 0→1 and y 8→0 over 180ms, cubic-bezier(.22,1,.36,1); reverse direction on Back. No scale or width animation. Preserve overview scroll position and selected saved training on return; restore focus to the initiating Edit/Builder control. Reduced-motion disables motion. Same behavior for hero and saved-row entry points.


## Rollout inventory, 2026-10-06

| Control | Implementation / boundary |
| --- | --- |
| App top navigation | 34px group, unframed, 230ms selection marker; mobile bottom icon/text navigation keeps its existing touch geometry |
| Appearance / spacing / text size | Shared 28px standard SegmentedControl |
| Translation | Off + remembered language + transparent disclosure; language label re-enables translation |
| Statistics period / active languages | Shared 28px selection; ordered active languages fit available width, up to four, with remembered overflow slot |
| Statistics Your material | All for selected language + remembered dictionary/collection; transparent menu trigger, original single-language reads |
| Library filters / noun article choices | Transparent 28px chips, soft selected fill, integrated noun disclosure without divider |
| Library meaning-card service actions | Isolated 28px family, 8.4px radius; Library ratings compact at 28px; Training unchanged |
| Learning-language management | Active/Paused mutations and reorder remain management actions, 28px without frames; paused rows must remain available here to resume them |
| Add / icon actions, native switches | Existing quiet/touch geometry preserved; not single-selection tabs |
| Reveal / audio / report / confirmations / auth / premium / account / admin | Distinct interaction families; retained, not globally converted to capsules |

Success-only account-save messages are omitted, including legacy reading settings; loading, errors, retry and conflict feedback remain. Mobile Builder content has a bounded flex chain and contains overscroll. Saved-list indicators overlay only the list, leaving its heading visible. Keyboard focus and reduced-motion behavior remain supported.

## Library filter follow-up

Library filter dialog uses the same shared BuilderSection disclosure and one outlined frame with inset dividers. Language is selected in place using the measured LanguageScopeControl. Source opens a bounded list in place; search is visible for more than ten options and is explicitly enabled by the search icon for shorter lists. Part of speech retains the existing chips and noun article popover. Draft preview, Cancel and Apply boundaries remain unchanged.

Selection capabilities are distinct from presentation: Library currently stores one dictionary ID or one collection ID (or all readable dictionaries of the selected language). Builder stores an array of dictionary IDs or one collection. Dictionary pools are supported end to end by training dictionaryScope and the authoritative SQL planner. Combining multiple collections or dictionaries with collections is not supported. Reusing the same Source appearance must not imply support for these mixed scopes.

Account Sign out is a quiet 28px action with a muted destructive text color. Text-entry fields keep their existing field boundary and caret without an additional focus outline or shadow; keyboard focus on buttons and other non-text controls is retained.

### Library action audit — 2026-10-06

Learn retains a soft filled surface at 28px; the no-background rule applies to service actions and control groups, not this primary action. Library ratings use 28px compact controls while retaining the existing rating colors and left markers. Training ratings retain their existing geometry. The scheduling summary remains beside the exact card, rendered as muted secondary information with a clock icon; its values and directional scope are unchanged.

The activity calendar renders the full available year when its content container is at least 560px wide, using compact 10px cells. Narrow containers retain three-month paging. Day details appear at the cell through hover, keyboard focus or tap, rather than in a separate permanent row. Escape, blur, pointer leave, scrolling and resizing dismiss the tooltip.

Audited families: navigation 34px; selectors and filter chips 28px without group fill; launch actions 44px; Builder secondary Save 28px outlined; Library primary Learn 28px filled; Library service actions and ratings 28px; account Sign out 28px quiet. Dialog confirmation controls and the mobile navigation preserve their separate sizes.
