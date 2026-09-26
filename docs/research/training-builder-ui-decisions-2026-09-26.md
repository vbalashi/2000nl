# Training builder: agreed UI direction

2026-09-26. Design decisions for the next Pen iteration; not implemented runtime behavior.

- Page heading: back arrow immediately left of Session builder; remove Training breadcrumb. Return to Training home. Preserve the in-progress setup on return as a design proposal, not a verified runtime guarantee.
- Restore desktop navigation icons from `apps/ui/components/navigation/AppDestinationNav.tsx`: Lucide Play, Library, ChartNoAxesColumn; current implementation uses 15px icons and 8px icon-label gap.
- Mobile primary navigation: bottom Training / Library / Statistics with icons and labels, not a dropdown. Builder remains within Training.
- Collapsed dependent-filter summaries show parent plus number of constrained fields: Nouns · 1, Verbs · 3. Multiple values in one field count once. No active child constraints means no numeric badge.
- Empty optional selection means unrestricted. For schema-declared exhaustive groups only, selecting all values normalizes to unrestricted. This is a deliberate UI contract: it can include unknown metadata again. Do not silently apply it to non-exhaustive categories. Regular/irregular exhaustiveness awaits the data audit.
- OR within multi-value fields, AND across fields inside a POS branch, OR across POS branches. Required exercise directions keep at least one selection; optional-filter normalization does not apply to direction selection.
- Availability, exclusivity, dependencies, allowed combinations and clear-on-parent-removal must be declared, not inferred by the UI. Distinguish invalid/product-unsupported combinations from valid combinations returning zero matches.
- Open POS disclosure segment: original purple #4E3FD1 at 60% opacity (#4E3FD199), white chevron. Preserve this accepted treatment; no gray-purple substitution or physical chip-panel bridge.
- Direction previews: equal compact dimensions, matched prompt/answer slots; examples keyed by family and learning/translation languages. Actual production training-card styling remains unverified.

## Mobile design validation

Create a small clearly named mobile review zone, not duplicates scattered through desktop history. Show a collapsed builder, a long POS list with an expanded verb editor, and source selection overlay. Include direction-card layout and a narrow-width stress detail.

Use approximately 390px and verify 360px width. POS choices wrap rather than requiring undiscoverable horizontal scrolling. Selection and disclosure targets must remain comfortably tappable. Long property rows become stacked label/choices on narrow screens. Preserve selections when switching edited POS. Show actual viewport with page scrolling, bottom navigation safe area and action placement; do not claim all expanded content fits by making a very tall phone frame. Avoid stacked sticky bars consuming the viewport. Source search with keyboard must keep a usable list and reachable confirmation; include a compact keyboard-state detail. Keep illustrative grammar capabilities explicitly exploratory outside product frames pending audit.
