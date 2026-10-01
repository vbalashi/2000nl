# Session builder interaction prototype — #407

Owner: current Codex design task, branch codex/407-builder-prototype.
Question: does the approved Pen interaction model remain clear while selecting, expanding, collapsing and editing nested filters at desktop and mobile widths?

Run from apps/ui: `npm run dev:builder-prototype`; open `http://127.0.0.1:3100/dev/session-builder-prototype`. No backend, credentials or login required. The command supplies a local placeholder configuration because the existing global app shell initializes its client; use the 127.0.0.1 origin rather than an already-authenticated localhost tab. This is fixture-only QA, not a local backend health check. Development only; production route responds with notFound. Uses existing Next fonts, navigation component, Lucide icons and shared Tailwind palette alongside the approved Pen purple.

One agreed design, not alternative concepts. Current user decisions supersede the older #407 single-family/inline-only brief for this isolated visual prototype; backend integration semantics are NOT changed here. Mixed families and typed answers are fixture-only interaction previews.

- Words / Idioms / Translation only; no Example sentences.
- No synonyms/antonyms controls; automatic eligibility of a future dedicated exercise is separate.
- Live summaries remain visible whether sections are open or closed.
- Removing Nouns clears article. Selecting both de and het clears the optional restriction. Other POS have no disclosure.
- Direction requires at least one and does not multiply meaning counts.
- Mobile compact direction cards emphasize the prompt and show quieter answers; white noun editor on mobile and pale editor within white panel on desktop.
- Fixtures include unknown POS and mixed/missing articles. Counts reflect source/POS/article/type fixtures, not actual coverage. Session size and balance do not implement scheduling.
- Inspector exposes state and delayed/zero/error calculation scenarios. Pending responses are cancelled on changes. Presets are memory-only.
- No actual training starts, persistence or learning-state mutations.

Review pending. Absorb verified decisions into implementation with proper runtime contracts and checks, then remove this disposable route; do not ship prototype logic as production scheduling.

Latest mobile review: two direction cards side by side with Direct selected initially, subtle selected fill and filled check; header divider and stronger prompt. Noun editor opens in an anchored focus popover with a dimmed/blurred dismissable backdrop, preserving choices on close.

Validation: TypeScript and focused ESLint passed. In-app browser interaction checks at 360/390px: live exercise summary; last direction retained; article all-selected reset; noun removal clears child; Escape closes popover; searchable source selection; in-memory named preset roundtrip; zero/error counts disable Start; no horizontal overflow. Desktop reviewed at the default browser width. This is fixture-only evidence, not backend verification.

Polish iteration 2026-09-26: reserve the page scrollbar gutter so accordion changes do not shift the centered layout; label-free exercise summary; a shared accessible purple dot marks active noun subfilters in both chip and summary. Optional noun restrictions are unchanged. Slimmer 32px desktop choices / 36–38px mobile controls, short press feedback, rotating chevrons, animated desktop height and mobile popup enter/exit, with reduced-motion overrides. Range endpoint captions now sit next to the track. Learning language is a transparent mobile row opening a compact picker. Dutch and English are explicitly illustrative fixture languages; switching language resets source/POS/article and updates examples and available sources. No claim about the user's active languages or production language support.

Polish verification: before correction main x changed 152.5 → 160 at 1280px when Exercises collapsed; after correction x remained 152.5. Desktop, 390px and 360px inspected; 360px popup bounds x17–326, content width345 ≤ viewport360. Checked language/example/source reset, label-free summaries, noun indicator, de+het normalization, close/preserve via Escape, and reopen. TypeScript and focused ESLint passed. Browser fixtures only. Reference research and review captures: docs/research/training-builder-polish-2026-09-26.md.

## Four-design comparison — 26 September 2026

Question: how does the same session-builder behavior feel in our current design, a Linear-inspired compact workspace, actual Radix Themes controls, and an Emil Kowalski-inspired tactile interpretation?

- Original route remains the baseline: `/dev/session-builder-prototype`.
- Desktop comparison: `?view=compare` (2×2 by default).
- Four mobile previews: `?view=compare&device=mobile` (four across on wide screens).
- Individual variants: `?variant=current`, `?variant=linear`, `?variant=radix`, `?variant=emil`. Floating switcher and arrow keys preserve draft state. Keyboard shortcuts ignore controls/editable fields.
- Gallery can switch desktop/mobile, four-across/2×2, or focus one design at natural size. Each iframe has an actual viewport; desktop comparison uses 1060px and mobile 390px. Scaled previews are labeled as such.
- Sync choices is on by default. Draft, open sections, and noun editor are synchronized through same-origin, registered-frame messages; dialogs, navigation and in-memory preset lists are local to each view. Turning sync back on adopts the most recently edited draft. Reset/scenario buttons apply to all views even when sync is off.
- Overview, Exercises, Noun filters and Session scenes open and scroll to the same section in each preview. Wait for all four frames to be ready before enabling scenes. No persistent storage or real data added.

B and D are explicitly interpretations, not official themes or replicas. B changes desktop navigation to a sidebar and uses compact aligned property rows. C uses `@radix-ui/themes` Button, CheckboxCards, Slider, Theme and Dialog, with modular settings cards. D uses separated soft cards, pill controls, restrained monochrome selection and short tactile feedback. Lexical Newsreader examples and all filter/direction rules remain shared. A retains baseline layout/styles; controls were extracted to allow C's real components.

Radix Themes 3.1.6 is pinned as a prototype dev dependency: its declarations work with this repo's existing TypeScript module resolution. Later 3.2/3.3 declarations import `radix-ui/internal`, which the existing resolution did not resolve; no app-wide TypeScript configuration was changed. Slider thumb receives an accessible label because this version only passes aria-label to its wrapper.

References:
- https://linear.app/now/behind-the-latest-design-refresh
- https://www.radix-ui.com/themes/docs/components/checkbox-cards
- https://www.radix-ui.com/themes/docs/components/button
- https://emilkowal.ski/ui/you-dont-need-animations

Validation: typecheck, focused ESLint and whitespace check passed. Browser checks: all four frames ready; Idioms/Reverse and learning-language changes synchronized; Radix slider changed all session sizes 20→25; sync-off changed only Linear 25→30; individual variant switching preserved Words+Idioms; Radix prevented clearing the last direction; 360px Emil popup stayed inside viewport; mobile and desktop focus/grid views inspected. Fixed a zero-width ResizeObserver measurement for hidden frames that produced an invalid height. Transient CSS hot-reload errors while changing dependencies were cleared by a fresh gallery load; no persistent runtime failure observed. This remains fixture-only UI verification.

Review image: `/Users/khrustal/.codex/visualizations/2026/09/26/session-builder-comparison/four-mobile-designs.png`.

Verdict pending user comparison. No Pen changes, production integration, deployment or PR in this iteration. Keep only the chosen direction (or explicitly selected combination) when this comparison answers the design question.

## D × 2000NL palette study — 2026-09-26

Open `?view=palette&palette=solid|soft|notch`. Three user-requested palette/selection treatments retain D geometry and Inter/Newsreader. The live training preview imports the actual shell, answer header/body, face and review buttons with fixture content. Light colors are scoped explicitly so saved dark mode does not contaminate this light study; production components are unchanged. Review button semantic colors remain original. A subtle press scale is local to this study. Builder exercise type is now single choice. Translation examples/preset update flow are still pending separate correction.

Current candidate: notch (white surface, violet left accent on ordinary choices; no added check or width change); user verdict pending. Compare against solid for stronger selection visibility and soft for gentler area fill. No persistence or actual review recording. Typecheck passes; lint has an existing handlePlayAudio hook warning in TrainingSenseCardV2Session. Desktop three palettes and 390px layout inspected.

User correction: do not append checkmarks or change button width on selection. Direction previews retain their existing checkbox and soft selected background, without a left accent.

Lavender selected by user. Local study refinements: rating label weight 400; CTA muted lavender #d8cfee with dark plum ink; noun label 11px/400 and 5px green dot on both faces; exposure badge soft border and matching 11px Inter. Production components unchanged.
Lavender spacing refinement: metadata-to-headword margin 18px (was 8px); answer body top padding removed (was 8px), bringing definition closer to headword. CTA ink deepened to #37254f; selected direction check uses muted lavender fill with plum mark instead of bright indigo.

## Library exploration checkpoint

Lavender accepted as baseline, language check colors aligned. Library available from primary navigation and `?view=library`. Twelve illustrative entries, initial nonempty alphabetical list, search word/English gloss, collapsible source scope, selected-word detail, mobile list/detail transition and zero-result reset. No dictionary calls or writes. Desktop and 390px checked; typecheck passes; lint retains existing handlePlayAudio warning. Current contract ADR-0016 and discussion archive distinguish approved baseline from proposed Library structure.

## Library structure correction
Owner rejected invented single-definition detail as a substitute for the existing Library structure. Goed preview imports LibrarySenseCardGroup directly: POS/2K/actions/headword and meaning cards. Content extracted read-only from root db/data/words_content/*_goed_{zn,bw,bn}_*.json, source articles a4439/a4441/a4440. 3 noun, 1 adverb and 3 adjective ordinary definition-bearing records; standalone idiom-only records excluded from this ordinary-meaning fixture, not a claim about production result counts. Embedded examples/idioms preserved, no invented translations or learning state. Audio/translation/train actions provide explicit local preview notices; no network calls. This replaces invented detail for these three real groups; other sample entries remain illustrative.

## Library variants, 2026-09-27

Owner requested common page anchors and a constrained component system. Library main now shares D's 840px maximum width instead of1120px. Two URL variants: `?view=library&layout=compact` and `layout=reading`; independent `nesting=plain|blocks`. A:50px minimum rows, typography-only nesting. B:72px minimum rows with definition preview, soft idiom blocks. Selection/open meaning/local action state survives switching presets. Browse all renders25 mixed-length records (goed source groups + illustrative entries +10 extra local source excerpts). These are fixture subsets, not production counts.

Prototype rendering now uses one LibraryArticle/MeaningCard/ContentNode implementation, reusable Metadata/LibraryButton/LibraryIconButton, explicit scoped semantic CSS tokens and the existing LibrarySenseCardGroupModel + SenseCardReveal. It is a presentation experiment over the existing domain model, NOT a production-component replacement or a complete production capability implementation. Removed old class-fragment dark-theme overrides; no gradient is painted, so scroll no longer borrows dark colors. Restored nested source idiom examples. New/Learning/Known and collection checkbox are explicit in-memory demo states. Actual Translate/Audio/Train next do not call services. Production components unchanged.

Checks: typecheck passes; lint has pre-existing handlePlayAudio warning. Browser1029 main width840 and no horizontal overflow;390 no overflow, mobile detail→list returns25 entries. Keyboard Learn transitions to Learning/Train next; Collections selection retained across A/B; collapsed content inert. Full screen-reader/focus-return QA remains outstanding. User choice pending.

## Library component matrix — 2026-09-27

User requested composable components and independent variations after six mobile comments. `libraryStudy.ts` is the typed option registry (return, numbering, visual height, shape, action grouping, nesting, New/Review scene); `LibraryStudyPanel` renders the matrix from it. Three seed combinations Quiet/Guided/Tools; URL persists all options. Density stays independent. NumberedMeaningFrame, LibraryArticleHeader, MeaningContent/LibraryContentNode and MeaningActions are shared across every combination. Existing production model/reveal remain; rating demo imports the actual TrainingCardReviewButton. Production still has separate renderer internals, including inline ordinal: this is not yet a single global presentation system. See docs/discussions/2026-09-27-02-library-component-matrix.md for the audit and migration boundary.

Corner numbers restore the border cutout and remove the reserved left column; New remains quiet. Audio/translation at metadata level; exactly one exit control. Buttons compare 28/34px, rounded/pill, full/compact/overflow layouts. Five nested-content options include semantic colour rails and phrase-outside/children-inside soft block. Learn, Known, Manual Exclude/Undo, collections, report and ratings are local demos only. Existing production exclusion semantics are not changed. New/Review scenes are comparison tools, not an approved Library review capability.

Verification: typecheck and focused lint pass. Browser 1029/412/360: main max840, no horizontal overflow, mobile natural page scroll, three presets and custom combinations; local rating, exclude/known/undo, collections, report panel, URL/reload. Fixed dark-mode contamination of imported ratings and narrow secondary-row clipping (Report becomes icon-only in narrow containers). All combinations and full accessibility audit remain untested. User selection pending.

## Library owner review — 2026-09-28

Eleven comments applied: 14px 2K badge, always-visible collection count, portal action menu with 44px items, hidden visual page heading, continuous hybrid content rail, section icons, no article-header separator, separate collection search/create/select dialog. Collection catalog and per-entry memberships now live in a shared demo provider across word selection. No real mutations. Toolbar places primary action above secondary controls; learnWidth full/inset and ratingInk neutral/exact/tonal are independent comparison axes. listing metadata/counts/preview controls the wide list; narrow/mobile removes source/count/preview. Homonym numbering is not invented from senseCount. 28px control height accepted; list content still under review.

Browser 1024/412 checked: menu height invariant; collections create/select and count survives closing/reopening article; list adaptation; main840 and no horizontal overflow. Exact-accent text has calculated white contrast 1.51–2.69; darker related text 5.12–6.24, default tonal for comparison. Typecheck/focused lint pass. See discussion 2026-09-28-01-library-overlays-and-list.md.

## Frame exposure and nearby counts
Full-width Learn, tonal rating ink and toolbar overflow are accepted defaults. New study axes: exposure=frame|inline and countPosition=near|edge. Frame badge uses Repeat2 and New / demo 3× (not real review history). POS colours come from design-guide families; Metadata owns them for list and header. Sense counts remain visible in narrow lists. Desktop 855 px and mobile 412 px inspected; typecheck and focused lint passed. See docs/discussions/2026-09-28-02-library-frame-exposure.md.

## Translation study
Shared TranslatedText uses SenseCardReveal for entry equivalents and inline translations. Full English demo coverage for goed; short equivalents for other demo entries. Translation toggle preserves expanded senses. translationInk=warm|neutral; headerShape=circle|rounded affects only audio/translation. Browser checked at 412/1024 px; typecheck and targeted lint passed. No translation-provider calls. See docs/discussions/2026-09-28-03-library-translations.md.

## Nested translation hierarchy
nestedReading=paired|literary|tiles|original compares labelled pairs, literary example, separate surfaces and original typography. Collections now 11 px like ratings; desktop gap 10 px, mobile observed gap 8 px retained. Browser QA 1051/412 px, typecheck and targeted lint passed. See docs/discussions/2026-09-28-04-library-nested-reading.md.

## Page list / independent article
Owner selected Literary example (default). Search toolbar sticks while list uses document scrolling; sticky article owns one native scroll container, with edge chaining to document. Stable minimum workspace height prevents the main header returning on short/empty search. Actual toolbar height observed for filters/resizing. Desktop scroll independence and edge handoff, empty search and 412 px checked; typecheck/lint passed. See docs/discussions/2026-09-28-05-library-scrolling.md.

## Border role labels
roleLabels=border|inline compares inset Explanation / Example labels with the previous standalone lines. Scoped to hybrid + paired/literary. Border mode uses the outer top edge and inner separator without reserving label rows. Desktop/mobile 412 px reviewed; typecheck and focused lint passed.

## Transparent inset labels (owner follow-up, 28 September)
Removed the opaque lavender patch behind nested role labels. The label is transparent across the white/lavender boundary; two adjacent CSS rules draw the line without crossing its text. Browser verified with translations visible. CSS-only refinement; diff check passed.

## Label alignment correction
Owner requested a common vertical axis for Explanation / Example and no left stroke breaking the rounded soft-block corner. Consolidated conflicting border-label rules: both labels share left:0, transparent backgrounds, rules only after the text, no outer outline or leading stroke. nestedTextInset=aligned|inset compares text on the label axis with an 8 px inset. Browser coordinates confirmed equal label x and text x=label x+8. Screenshot inspected; typecheck, focused lint and diff check passed.

## Mixed label placement
Owner follow-up: Explanation returns inside the soft block; only Example stays on the divider. Shared label axis, transparent Example background and optional 8 px text inset retained. Browser screenshot verified; typecheck passed.

## Example without separator
Added roleLabels=plain (Example without line): same placement and spacing as the divider version, with only its rule hidden. Explanation stays inside the block. Browser verified; typecheck passed.

## Statistics first pass
Library plain labels / inset text accepted and made defaults. StatisticsPrototype adds current study-day counts, started-card progress, illustrative Words/Idioms scopes and a first-visit state. Uses concepts from exercise stats read model but no backend calls. Direct view=statistics route. Desktop/412 px, scope/state switch and training navigation verified; typecheck/lint passed. Statistics remains a proposal.


## Statistics exploration — 28 September 2026

Replaced the large month calendar with a separate compact, seven-row annual heatmap inspired by the user’s reference. Day selection reveals new-card and review counts below; mobile horizontally scrolls the map, initially showing recent months. The learning-scope trigger sits alongside languages and opens a modal with a blurred backdrop instead of a native scope dropdown. Scope names and history remain illustrative fixtures. Period controls only affect activity totals; queue and coverage remain current-state measures. Training handoff is a named preview, not a real session launch. Training landing content and the usefulness of period/coverage controls remain open design questions. No production APIs or learning state changed.

Statistics follow-up: language-wide activity, heatmap, streaks and exercise records are now independent of the training scope. Scope segments moved above Due now and Material coverage. Mobile shows two months with earlier/later buttons instead of scrolling. Current streak tolerates an unfinished today; longest streak and best day use the demo year, daily average uses 30 calendar days including inactive days. Prototype fixture calculations only.

Statistics refinement: renamed invented training labels to 2K (2,000 most common words) and Idioms throughout selection, coverage and handoff. Language/material segmented controls are 28px including the outer border. Activity adds illustrative study minutes for the selected period and day details, without adding a fifth record metric. Mobile activity uses a 2×2 grid. Real active-time measurement remains unimplemented.

## Settings first pass — 28 September 2026

Statistics accepted for now. Gear now opens Settings, with Languages, Reading, Appearance, Shortcuts and Account. Based on existing SettingsDestination and ReadingSettingsSection, rather than a recovered prior chat proposal. Interactive in-memory previews cover translation, learning-language ordering, and independent desktop/phone text sizes. Settings remain mounted across navigation to retain choices until reload. These values are not connected to production preferences or other prototype screens. Interface stays English; account actions are disabled. Lavender is current; Classic blue and Monochrome are visibly planned, disabled palettes. Shortcuts come from the existing production definition. Direct preview URL: ?view=settings. No API/auth changes.

## Settings reconciliation — 28 September 2026

Recovered the September 24 discussion in “Уточнить модель словарей и списков” and its accepted issues #469, #471, #475. July notes are historical, not the latest authority. #469/#475 explicitly reject a global dictionary on/off preference, and keep lookup scopes per context and training selection in Training. Today's requested switches conflict with that; clarification is pending. Dictionary toggles currently demonstrate local selection only and do not implement policy. Billing preview has no payment integration or invented prices; timed entitlements and paid status are distinct.

Removed visible Settings title/back row; the gear marks the active destination. Light/Dark/System mode shares state between header and Appearance; other palette themes remain planned. Added a searchable ISO 639-3 catalogue (7,927 records, retrieved 2026-09-28 from https://iso639-3.sil.org/sites/iso639-3/files/downloads/iso-639-3.tab; SIL attribution in picker). Catalogue is not a verified provider-support list. Interface options remain only en/nl/ru as a selection preview. Learning-language pause preserves state and cannot pause the final active language. Billing and dictionary figures are fixtures, not account data.

Text size reuses LibraryArticle/MeaningCard/MeaningContent with preview props omitting actions. All meanings expand, including idiom explanations, examples and English translations. Automatic device profile uses the existing detectReadingDevice helper (not window width), with independent in-memory phone/desktop values; manual device tabs removed. Values still do not persist to production preferences.

Settings refinement: Text size moved under Appearance. Mobile section pills replaced by a modal left drawer and current-section label. Dictionary heading replaced by prominent purpose copy, language groups and visual switches. Translation picker keeps fixed height and input position while filtering; search includes Unicode-normalized English, Russian and Intl native names plus explicit krc/zh/ar/fa variants (coverage depends on locale data, not universal). Interface language uses a styled three-option disclosure with outside/Escape dismissal. Preview wrapper no longer inherits Library full-page minimum height. Subscription subheading retained to distinguish plan from billing details/payments. QA: drawer selection, rare-language search, unchanged 620px modal geometry, phone dictionary layout.

Personal dictionary settings aggregate language-specific dictionaries into one always-enabled block. Storage remains per user and language (ensure_user_dictionary); creation uses entry.languageCode, or the explicitly selected dictionary. Counts remain illustrative. Language search retains both two- and three-letter ISO codes, including bibliographic aliases, and prioritizes exact code matches.

Mobile settings now use a full-screen menu/detail hierarchy with back navigation, no app header or bottom navigation, and reduced-motion-aware slide transitions. Mobile panels lose outer frames and repeated section titles. Card text size and its live Library card example share one panel. Prototype-only explanatory copy is removed from settings; data and state remain fixtures/in-memory.

Frameless study: desktop settings use a left sidebar and a centered 620px content column, with no outer panel surfaces. Library outer word frame defaults to flat; Variations can restore the original or remove only on phone. Individual meaning frames stay intact. Search filters retain a 44px hit target with no idle border/background.

Meaning markers now default to a quiet row just above each frame, with the original border placement available in Variations. Back control matches round white audio/translation controls. Statistics Activity, heatmap and coverage have no outer panels; summary strip keeps its fine outline. Desktop settings menu uses 28px single-line items. Translation and text-size samples retain explicit frames.

Mobile Library now keeps the list visible and opens a nonmodal bottom sheet on word selection. Drag the top handle (or tap/use arrows) to expand or collapse; pull down again from peek to dismiss. The word header stays fixed while meanings scroll; collapsing returns to the beginning. Desktop uses a separated close icon at right. Visible scrollbars are hidden without disabling scrolling. Meaning markers have more space from the preceding card. Statistics Activity uses the same grouped metric treatment as highlights; material selection controls queue/coverage, and Practise opens the selected material in Training.

Panel motion: desktop enters with a 16px slide from the right and fade (200ms), exits in 180ms before unmount. Mobile navigation stays above the sheet at all snap positions; full sheet leaves 72px for navigation and exits beneath it. Both layouts use a white round close control. Reduced motion skips timed dismissal. Settled sheet has no filter, backdrop blur, opacity change or transform.

Single selection always collapses all meanings; desktop double-click always expands all (not a toggle). Preview remains expanded. Meaning scroll contains overscroll so it cannot move the page/header at its boundary; desktop sticky container has sufficient vertical space for the complete word header.

### Library filters and builder language control — 2026-09-28
- Search filters now opens the shared modal, with language, source, multi-select parts of speech, and Dutch noun article controls. Draft changes apply with Show results; Cancel preserves the applied selection. Counts include the text search. Noun article restrictions do not exclude other selected parts of speech.
- Language changes clear source/article restrictions. Library fixtures remain Dutch-only; other languages show an empty result without relabeling Dutch data.
- Builder Learning language uses section-title typography and a compact value button with an adjacent chevron.
- Checked desktop/mobile modal layout, noun/de + verb union (11 entries), VanDale narrowing (5), cancellation, empty language result, reset, and builder picker opening. Typecheck and focused ESLint passed. Local health targets local DB but reports missing credentials; this fixture-only UI does not require database access.

### Library filter navigation revision — 2026-09-28
- Replaced native selects and expanding article section with a fixed-size sliding screen stack. Language/Source rows open searchable lists; parts of speech are separate selectable rows and Nouns has a subfilter arrow/active dot.
- Back/OK returns to the main filter screen, Escape backs out of a child screen before closing. Hidden screens are inert, focus returns to the originating row, and reduced motion skips the slide.
- Article screen has only de/het; null displays both selected (unrestricted), clicking either narrows, and clicking again restores both. Other selected parts remain included.
- Builder language picker is left aligned with the shared value column; desktop section headings share a 140px column to avoid wrapping Learning language.
- Checked mobile and desktop navigation, source/language search, noun dot, de/het transitions, Escape return, and unchanged modal dimensions (558×738). Typecheck and focused lint passed.

### Result-list scrolling and filter comparison — 2026-09-28
- Reproduced short-list disappearance: three rows fit (207px content/viewport), but PageDown moved the first row from y=180 to y=1 beneath the sticky search bar. The document was scrolling, not overflowing results.
- Desktop results now stick below the toolbar and scroll internally only when their content exceeds the available height. Same short-list check keeps the first row visible; long-list check reaches the last row (1731px content, 611px viewport, scrollTop 1120).
- Variations → Library filters compares Rows/sliding screens with Chips/subfilter popover. Both use the same filter model. Chips reuse builder controls; the noun disclosure opens a nearby modal popover with blurred background, de/het, Escape/backdrop close, and focus return. Language/source screens remain searchable.
- Verified variation switching, article dot and selection, nested Escape preserving the parent, mobile popover within viewport, typecheck and focused ESLint.

### Builder language/source drill-in — 2026-09-28
- Replaced Learning language picker and Material accordion with grouped Language/Source rows. Each opens an animated in-page selection screen with search, Back/Cancel, and OK; Source retains dictionary/collection filtering and supports the full source fixture list.
- Selections are pending until OK; changing language preserves the existing reset of source and language-specific filters. Exercises, Filters, and Session remain unchanged.
- Verified source search and apply (Dutch dictionary), language change (English → Everyday English), mobile layout and back navigation. Typecheck and focused ESLint passed.

### Unified builder summary rows — 2026-09-28
- All five summary rows now share the same lavender surface, padding, columns, typography, radius and minimum height. Scope rows navigate right; accordion chevrons expand down without circular backgrounds.
- Removed the outer white/bordered accordion surfaces. Expanded controls sit on the page background; concrete direction cards retain their frames.
- Verified expanded/collapsed desktop appearance, mobile summary wrapping and language drill-in/back. Fixed inherited mobile summary order so it stays between the title and chevron. Scrolling remains available with hidden bars.

### Expanding-frame disclosure experiment — 2026-09-28
- Added Builder Variations: Flat sections / Expanding frame, persisted in builderDisclosure URL parameter. Frame is the experiment's default; existing flat behavior remains selectable.
- The summary background becomes continuous 4px side rails and a 5px lower lip. Grid-height expansion moves the lower lip with content over 400ms, with no content fade. Reduced-motion skips transitions; closed content remains inert.
- Verified opening/collapse, selected noun summary, both variation styles, mobile layout, typecheck and focused ESLint.

### Inline scope accordions and fresh-session reset — 2026-09-28
- Language and Source now reuse the same accordion Section as Exercises/Filters/Session. Choices apply immediately; source search/type filters remain, with a bounded scrollable list. Language changes reset incompatible source/article/POS state as before.
- Initial builder and New session reset all sections closed, including noun subfilters. Verified reset after editing language/source, not only on first entry.
- Frame opening has square upper interior corners. Header hover tints the complete frame; keyboard focus outlines the complete section rather than only the header.
- Checked desktop/mobile, source/language selection, five collapsed aria-expanded states after New session, zero top interior radius, typecheck and ESLint.

### Sentence translation direction — 2026-09-28
- Translation now has one sentence preview from the Settings translation language into the learning language, with explicit language labels instead of selectable Direct/Reverse cards. Its draft direction is Reverse; switching back restores the prior word/idiom directions.
- Shared translation-language state with Settings. Off or identical source/target languages show guidance and disable starting this exercise. Fixture examples cover common languages; other catalogue languages show a labeled placeholder.
- Verified mobile English-to-Dutch sentence preview, German setting propagation, and return to Words/Direct. Typecheck and focused ESLint passed.

### Word details exploration and compact Translation — 2026-09-28
- Translation reuses the two-column Directions grid with one occupied cell and the shared direction-card styling, including mobile typography.
- Inspected the shared Note/Meaning schema, V2 rich-content projection, and reference checkout's ignored local VanDale import (17,959 entry records, not unique headwords or live database counts). Populated fields include plural (7,188), diminutive (2,366), verb_forms (4,086), conjugation_table (3,944), inflected_form (2,339), comparative/superlative (1,719 each), derivations (772), alternate_headwords (216). No populated synonym/antonym/related-term/usage-label/grammar-note/reference-table fields found in this snapshot; these exist in contracts and synthetic multilingual fixtures.
- Real sample choices for a future comparison: goed adjective (goede/beter/best), fiets noun (fietsen/fietsje), gaan verb (ging/is gegaan + conjugation table). Keep article/POS scope distinct from individual sense scope; do not merge goed noun/adverb/adjective details.
- Proposed visual comparison, not implemented yet: (A) concise forms summary below headword with inline expansion, sense-specific relations within each meaning; (B) all details collapsed in labeled rows; (C) contextual details subview for long tables, preserving the originating word/sense. Prefer A for small facts and C only for long tables. Avoid enlarging the sticky word header with the full details body.
- Future exercises should target explicit forms/relations, preserve sense context for synonyms, and have separate progress identity from word-definition cards. Existing conjugation scenario is seeded disabled; supported data fields are not proof of implemented exercise modes.

### Canonical details prototype — 2026-09-28
- Correction to the previous exploration: the 17,959-record corpus was a legacy local copy. Canonical source is reference checkout `db/data/words_content`; its structured relations are populated. No live database query or write was needed for this visual change.
- Added a minimal canonical snapshot for goed adjective, fiets, gaan and huis. Preserved source filename IDs for individual meanings; goed existing preview IDs match. Fiets/gaan/huis now use canonical definitions/examples/idioms instead of simplified demo entries. Relations are scoped by meaning ID (goed: slecht vs fout; fiets: het rijwiel; huis: de woning).
- Added Additional details comparison in Variations: brief forms summary + inline relations (default), or everything on request. Forms open in the scrollable content below the fixed header; conjugation has its own nested disclosure. No empty sections or training buttons without behavior.
- Binair's non-binair idiom annotation is not promoted to a sense relation. Idiom relation extraction/model extension remains outside this prototype; production API/DB untouched.
- Typecheck and focused ESLint passed. Browser checked all four entries, both variation modes, mobile gaan table and navigation; screenshots saved with visual evidence.

### POS morphology coverage and non-empty detail affordance — 2026-09-28
- Canonical checked-in corpus snapshot: 18,164 entry records (the live DB count recently supplied by the user is 18,163; these are separate snapshots). Counts below are records with each non-empty field, so fields overlap.
- Nouns (`zn`, 9,513): plural 7,213; diminutive 2,398; extra derivation 31. Lead with plural, fall back to diminutive; show other forms on the same disclosure.
- Verbs (`ww`, 4,304): principal forms 4,300; conjugation table 4,042; derivations 580. Four entries lack both principal forms and conjugation. Lead with principal forms, defensively derive a line from past/perfect then present if principal forms are missing; expand once to the person/present/past table. Perfect stays in the headline and is not repeated as another row beneath it.
- Adjectives (`bn`, 2,733): inflected form 2,340; comparative and superlative 1,709 each; derivations 182. Lead with comparative/superlative; if absent use inflected form, then a visibly labeled related-form line if only derivations/alternate forms exist.
- Adverbs (`bw`, 789): comparative/superlative 8 each; no useful general inflection. Numerals (`tw`, 77): comparative/superlative 2 each. Abbreviations (`afk`, 287): plural 41, diminutive 2. These use only their POS-appropriate forms.
- Pronouns (`vnw`, 143), prepositions (`vz`, 120), conjunctions (`vw`, 66), prefixes (`vv`, 51), interjections (`tsw`, 45), unknown POS (23), articles (`lidw`, 13): no useful systematic entry-form field; isolated plural/comparison values describe meta-entries, so do not show them as forms of ordinary words. Show meaning-level relations and notes where present.
- Crucial empty-form case: 372 noun, 101 adjective, 212 adverb, 31 preposition, 24 pronoun, 18 conjunction, 14 abbreviation, 11 interjection, 7 numeral, 3 prefix and 1 unknown-POS record have synonyms/antonyms but no entry morphology. They therefore get no word-form row; their relations remain under the relevant meaning (inline in the primary variation, a labeled on-demand row in the alternative). No empty chevron.
- Meaning-level relation counts (meanings with at least one value): synonyms/antonyms — noun 1,699/151; verb 752/72; adjective 690/336; adverb 166/58; abbreviation 17/4; pronoun 24/0; preposition 22/9; numeral 6/1; conjunction 18/0; prefix 0/3; interjection 9/2. This confirms relations must keep the meaning identity even when the word-level form strip is absent.
- The compact headword line has no “Word forms” title or divider. One disclosure opens all supplementary forms and the non-nested person/present/past table. Word-form text never goes through translation toggling.

### Grammar line visual comparison — 2026-09-28
- Variations → Word forms presentation now compares three one-line treatments of the same data: a plain caption, a lavender ribbon with one grammar rail, and separate grammar tokens. The ribbon is the current default. All three keep one disclosure for extra forms and the conjugation table; no nested disclosure.
- The collapsed line names each value's role without a heading: `Past ging · Perfect is gegaan`, `Plural huizen · Diminutive huisje`, or adjective comparison labels. This prevents the word forms from looking like unrelated loose words and avoids repeating the principal forms in the expanded table. Verb fallback values derived from conjugation data also receive their correct labels.
- Sense relations now use the same small icon/uppercase label/coloured vertical rail rhythm as Examples and Expressions, with the related word on the next line. Their rendering is independent of the entry-form strip; `ieder` demonstrates a synonym with no word forms. No meaning-level relation was promoted to a headword-level fact.
- Visual comparison at desktop and 430px: the caption is too detached; the tokens read clearly but resemble clickable filters. The ribbon best connects the grammar line to the headword while remaining compact. Verified `gaan` collapsed/expanded, `huis` with synonym, and `ieder` without forms; screenshots are in `/Users/khrustal/.codex/visualizations/2026/09/28/library-form-study`.

### Typography-led revision — 2026-09-28
- User rejected the ribbon/tokens treatment above: it adds interface noise and leaves the grammar visually detached. The earlier preference for the ribbon is superseded; no design has been approved.
- Replaced those options with `formStyle=editorial|columns|aside`: readable italic role labels alongside serif forms; larger forms with captions underneath; or a compact two-row annotation immediately beside the headword. All use the existing typography with no new coloured surface or frame. Editorial is a starting point for comparison, not a settled winner.
- Moved the compact morphology into the fixed word header. Its one-step expanded body stays in the independently scrollable content. Toggling returns that content to the top so the table is visible. The comparison dock now has previous/next controls (and arrow-key control when focused), preserving the selected word and open meanings while switching.
- Checked desktop compositions and mobile 430px `gaan`, including expanded table and header persistence on scroll. Evidence: `/Users/khrustal/.codex/visualizations/2026/09/28/library-typography-study`.

### Editorial forms approved — 2026-09-29

The user selected the first, editorial composition. It is now the fixed presentation: compact italic grammatical labels and serif forms attached to the headword. Removed the losing columns/aside styles and the form-design switcher; other prototype variations remain available. Expanded details still open once and scroll with the meanings.

### Training landing — 2026-09-29

Implemented the approved single-primary-training concept in TrainingHome. A quiet lavender hero uses a serif title, three compact numeric measures, and one dominant launch action. Other saved trainings are compact rows with separate play/settings actions. Settings can promote any saved training; the previous main training returns to the list. Editing a saved training updates it rather than creating duplicates. Launching from home preserves any builder draft.

This is a local interaction preview: three seeded routines and illustrative per-routine activity, plus an explicit unfinished-session preview control. Launch goes directly to the existing session-preview boundary, not the builder; actual training/resume and persistence are not integrated. No goals or motivational slogans. Direct entry: ?view=training.

### Direct editing and deletion — 2026-09-29

Removed the intermediate settings modal: sliders now open the saved training directly in the builder. Main-training assignment and deletion live below its settings. Delete asks for confirmation, preserves learning progress by only removing the in-memory saved setup, chooses another main if needed, and supports an empty state after deleting the last setup. Removed the visible Training/Dutch heading row; the hero eyebrow now carries its language. The page retains a visually hidden accessible heading.
