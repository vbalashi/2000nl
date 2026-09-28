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
