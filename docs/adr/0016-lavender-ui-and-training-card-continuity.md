# ADR-0016: Lavender UI and continuity with training cards

Date: 2026-09-26. Status: accepted visual direction; implementation is a local prototype, not production approval. Owner: UI presentation in apps/ui. Related issue: #407.

## Context

Training, Library and Statistics lacked a coherent visual hierarchy. Repeated Pen iterations accumulated duplicate boards. The owner approved the Emil-inspired D composition after comparing current, Linear-inspired, actual Radix Themes and Emil-inspired prototypes. Black controls were not essential to that choice. Existing training cards and their semantic review buttons should be preserved.

## Decision

Use D composition with the selected Lavender palette. This is our interpretation, not an official Emil design system. Inter is the interface font; Newsreader is lexical/definition content. Preserve reading-size preferences, core card layout and 4 distinct semantic review accents. UI controls must not inherit large reading sizes.

- Neutral light page, white sections, subtle borders/shadows; consistent chrome and icon navigation. Page widths may differ by task (compact builder, wider library).
- Selected controls: light lavender #eae5fa, border #ccc2ed, text #514295. Primary action: #d8cfee, border #c3b5e2, text #37254f; hover #cfc2e9. Direction/language selected check: same lavender family, dark plum mark, not bright blue/black.
- Selection never changes button dimensions. No appended checkmark widening ordinary buttons. Direction previews already have checks and do not gain a left stripe. Side-accent and solid variants remain comparison history, not the selected design.
- Review buttons retain thin neutral outlines and left 4px color accents: rose, lime, emerald, teal. In the prototype labels are weight 400; no new full-color backgrounds. These colors keep rating meaning and are not reused to categorize unrelated filters.
- Card metadata: noun label and exposure count 11px normal Inter, 5px green dot, soft count border. Same POS treatment on question/answer faces. No dark badge contamination in a light study. Headword/definition sizes remain unchanged. Metadata is farther from the headword (18px row margin) than the definition; answer-body extra top padding removed.
- Motion supports feedback, does not move layout: short transitions, subtle press response, reduced-motion support. Prototype CSS must be consolidated into semantic tokens before production; broad class-fragment overrides are not the production architecture.

## Builder behavior

Material, Exercises, Filters, Session are independent expandable sections. Summaries stay visible and update while expanded. Default session is disposable; saving asks for a name. Existing presets must eventually support Start, Edit, Update and Save as new. No claim of persistence in this demo.

Exercise type is single choice Words / Idioms / Translation. Hide postponed sentence/listening exercises. Direct/Reverse allow one or both where supported, never zero. Translation must follow actual word-in-context/reverse semantics in ADR-0015; the old demo direction example is incorrect and still pending correction. Do not introduce an independent translation scheduler or assumed backend direction.

Sources: searchable single-choice list of dictionaries/collections, compact metadata, scalable to 100+ sources; do not require redundant scope-mode choices above it. Filter schema owns dependencies/availability, not ad-hoc UI checks. Optional unconstrained fields are empty; all-selected collapses only for exhaustive schema-declared groups. OR within field, AND across fields in a POS branch, OR across POS branches. Removing parent clears descendants. Current noun subfilter indicator is a dot (supersedes earlier numeric summaries). Synonym/antonym presence excluded from this UI pending a useful exercise.

Both desktop and mobile show focused subfilter panel anchored below parent, parent stays sharp, background lightly blurred. Chevron/outside click/Escape close without clearing choices. No physical bridge between chip/panel. Production still needs complete focus management and viewport-edge positioning.

Availability updates automatically, animated pending state, stale responses ignored; zero/error actionable. Counts of matching meanings differ from presentation/session length. Current counts are fixture-only, ratio endpoints and large ratios require backend validation; no manual Calculate button by default.

## Navigation and next work

Desktop Training/Library/Statistics with icons; mobile bottom tabs. Back arrow beside Session builder title, no duplicate breadcrumb. Preserve selection while exploring related panels. English interface; learning-language content remains in its own language.

Library now enters visual exploration with a nonempty browsable list, immediate search, compact scope indicator and hidden source filters. Detail pane appears only after selecting a word (mobile replaces list). This particular layout is a proposal, not approved. Statistics is next, content/metrics not yet agreed. Do not carry placeholder metrics into production by default.

Sequence: review Library → iterate mobile/desktop and empty/loading states → design Statistics and Training home content → consolidate shared tokens/components → integrate one vertical slice at a time with real contracts → accessibility, responsive, auth/runtime and DB-dependent checks. No production redesign is authorized by this prototype checkpoint alone.

## Evidence and consequences

[Discussion history](../discussions/2026-09-26-01-builder-lavender-library.md); [current UI contract](../research/training-builder-ui-decisions-2026-09-26.md). Runnable dev-only route `/dev/session-builder-prototype?view=palette&palette=soft`; Library `/dev/session-builder-prototype?view=library`. All data is illustrative, no live mutations. Dark theme, real source/translation capability binding, preset update, focus trap/restore and complete phone QA remain integration tasks.

### Library clarification, 2026-09-26

Preserve the existing LibrarySenseCardGroup structure and headword/POS identity; do not replace it with an invented single-definition panel. POS + actual 2K indicator + translation/audio precede headword and meaning cards. The current goed preview uses the actual component with source-derived ordinary-meaning fixtures; the list/search chrome remains experimental. See discussion 2026-09-26-02-library-existing-structure.md.

### Shared outer geometry, 2026-09-27

Owner explicitly rejects independent destination widths. Training/Library/Statistics share outer max-width and horizontal anchors; density differences belong inside that region. This supersedes the earlier statement that Library may use a wider outer page. Prototype Library now uses the same840px D main container. Library variants are proposals, not approvals: compact one-line rows vs definition preview, typography nesting vs soft grouped blocks. New shared prototype presentation consumes the existing domain model; integrate only after user review and production characterization/capability tests.
