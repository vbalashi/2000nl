# Library UI review — 2026-09-27

Status: critique and proposed next experiment, not approved replacements for ADR-0016. Evidence: two screenshots and eleven browser-comment crops supplied by owner in current thread, plus local code inspection of LibrarySenseCardGroup, GoedLibraryPreview and library.module.css. No new browser interaction or production-state verification in this review. No UI code changed.

## Flow and findings

1. Search/list (owner full screenshot 1): recognizable Lavender shell, but excessive introductory stack and weak row hierarchy. POS must be adjacent to headword; 2K is core vocabulary membership, not a learning status. Sense count describes headword/POS group, not words/exercises. Proposed desktop dense 48–52px one-line rows vs 60–64px rows with a short source-derived definition preview, tested with 20–30 mixed-length entries. Do not stretch lexical label and POS to opposite edges of a full-width row. Keep stable list width while detail opens where possible; compare within the same master/detail shell, not several unrelated designs.
2. Group detail (owner full screenshot 2/comments 1–7,10–11): preserved headword/meaning structure is correct, but source toolbar + metadata + headword stack consumes too much vertical room. Consolidate source provenance with metadata; retain close control with an accessible hit area. Keep modest page heading, remove marketing subtitle and debug/sample message from product content. Compact language/source/count into one toolbar zone; do not hide the scope entirely. Translation/audio visible shapes 32px desktop, 40–44px hit targets for touch; icon16. These are proposed design sizes, not WCAG requirements. Page heading contributes orientation independently of selected nav.
3. Meaning/action/scroll (comments 4,8,9): absent actions are fixture incompleteness, not product removal. startLearning/markKnown null; onOpenCollections absent. Do not fabricate live capabilities: provide explicit demo capability states with local handlers. Learn and Mark as known available for eligible new meanings, Collections as subordinate action; Train next is distinct session intent, not a replacement for Learn. Proposed 32–36px desktop buttons, 40–44px touch targets; normal/medium labels. Card numbering should belong to card header, not float across border. NEW should not dominate definition.

## All comment resolutions (proposals)

1: Compact group header through removing duplicate rows/padding, preserve headword prominence.
2: 40px audio/translation controls are not intrinsically wrong; make visible footprint32 desktop and retain touch target on phones.
3: POS and 2K share11–12px type, baseline, optical height; 2K medium weight subtle lavender, POS unframed with tiny dot. Same roles, not identical decoration. Do not frame every label.
4: Restore full action states in demo; one primary action per state, compact sizes, Collections subordinate. Distinguish Learn from Train next. Current empty3fr grid cell contributes to wasted space.
5: Merge source provenance into group metadata, no dedicated tall source strip.
6: Remove tagline and fixture caption from product body, retain demo disclosure outside content.
7: Keep compact visible page heading initially; nav identifies destination, heading identifies content. Do not remove titles globally to solve whitespace. Heading size/margins should be shared across destinations; Session builder title still needed.
8: Try two nested layouts: A one shared indent with unlined explanation beneath italic expression, example subordinate; B one subtle background per idiom block, no stacked colored rails. Third alternative one group-level rail only. Prefer A for initial test, not yet approved. Preserve node semantics and full source examples.
9: Confirmed code cause: ScrollFade has dark:from-[#11151d]/dark:via while wrapper overwrites background. Use one theme surface token or true alpha mask shared by both fades. Do not patch each gradient independently. Avoid44px fade obscuring full text line; inspect shorter fade and scroll affordance.
10: Keep X for closing detail, no invented replacement. Keyboard close/return focus and mobile back need consistent behavior.
11: Keep language/scope/count information but compact into toolbar; no broad extra paragraph-height block. Active restrictions should be visible, results count less prominent.

## Component system before another styling pass

Owner explicit requirement: reusable domain components with constrained props, not selectors depending on generated Tailwind strings. Current .realPreview [class*="dark:"] overrides are prototype debt. Existing component reuse alone does not ensure consistent layout/theme.

Proposed small vocabulary: control density regular/compact; semantic surface/ink/border/accent tokens; metadata badge; icon button; headword header (metadata/actions/title); meaning card with state-driven actions; recursive semantic content tree. Domain model supplies capabilities and state. Container decides list/detail placement. Training and Library share lexical rendering, metadata/actions where appropriate, but have distinct density/layout needs. Do not build a generic schema-driven renderer for arbitrary UI or force every control to identical size.

Suggested spacing scale4/8/12/16/24; desktop button32/36, mobile target40/44; one shared typography scale and semantic color roles. Proposed numbers must be checked visually, not treated as accepted tokens yet.

Next sequence: repair demonstrated theme/action gaps and eliminate broad overrides in the touched seam; compare two list densities with real semantic metadata and two nested-content treatments; retain selected Lavender/Inter/Newsreader; inspect desktop1029 and phone390, long entries, empty/filtered list, multiple meanings, selected row and scroll. Then approve component contract before production migration. Statistics remains pending.

## Limits and references

This is a screenshot/code review, not accessibility certification or a backend audit. Metadata contrast appears too faint but needs measured computed colors. Full keyboard order, screen-reader grouping, touch hit areas and production capability state remain untested here. Current fixture omits standalone idiom-only records and some nested source metadata, so it is not the production projection.

W3C target minimum24×24 (with exceptions): https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html . Proposed40–44px touch sizing is this design's comfort target, not the AA minimum. Heading guidance: https://www.w3.org/WAI/WCAG21/Understanding/headings-and-labels . It does not prescribe a giant visible page title or require deleting one because nav repeats it.
