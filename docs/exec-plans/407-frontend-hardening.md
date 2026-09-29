# Approved practice frontend: consolidation and rollout gate

Status: shared presentation foundation implemented and checked; production migration is not complete. Date: 2026-09-29. Worktree: `.worktrees/407-builder-prototype`, branch `codex/407-builder-prototype`, baseline HEAD `5cc00eb73e54b50dbc74d103394a1b05cc935b66`. Changes are uncommitted on top of earlier approved prototype work.

Scope: approved local Training, builder, Library, Statistics and Settings presentation. Preserve the composition and the URL-controlled design choices. Do not infer that all experimental alternatives are now approved. Production routes, DB, auth and scheduler remain unchanged.

## Completed work

- [x] Reproducible typography/color inventory, distinguishing experiments from active screen styles.
- [x] Semantic color and typography roles across active screens; Lavender, Blue, Graphite × Light/Dark, with System following the OS.
- [x] Shared native dialog lifecycle, nested scroll locks, Escape/Back, focus restoration and icon actions.
- [x] Training presentation extracted from fixture data, array indexes and preview switches; public interface covered by behavior tests.
- [x] Type safety, focused lint, behavior/contrast checks and desktop/mobile visual checks.
- [x] Ownership, limitations and integration gates recorded in this document and the [presentation contract](../../apps/ui/docs/practice-presentation.md).

## Inventory and findings

The CSS audit found **542 distinct literal color spellings / 883 occurrences** across the original 12 prototype CSS files. This includes abandoned experiments, multiple encodings, fallback colors and states; it does not mean 542 colors were visible on one screen. There were 33 distinct font-size expressions, including 27 literal pixel sizes. Font-family declarations had six spellings; the approved interface actually uses two families, Inter and Newsreader.

Eight active screen styles had **274 color spellings / 426 occurrences**. Their corresponding styles now have **zero literal colors**: values come from the shared palette. The remaining literals in prototype CSS belong to the retained comparison/palette experiments. A baseline-to-current file move takes Training styles from `trainingHome.module.css` to `components/practice/trainingOverview.module.css`; preview-only controls remain separate.

The shared type system has **12 base sizes and two family roles**. Color roles are intentionally more specific than one generic purple: readable secondary text, selected controls, danger, focus, dictionary examples/idioms/relations and activity intensity have different jobs. Reducing all of these to a handful of arbitrary colors would make future themes harder, not simpler.

Before: independent dark rules, generated CSS-class substring selectors, repeated modal lifecycles, direct fixture/index coupling in the Training screen. After: shared semantic roles, scoped themes, reusable modal/icon behavior, and Training presentation driven by stable IDs and explicit states. Existing settings/theme swatches use the same theme definitions.

Inventory files: [before](407-style-inventory-before.json), [after](407-style-inventory-after.json). The audit script records its counting scope and runs as `npm run audit:practice-styles`; `npm run check:practice-styles` rejects new literal colors/type sizes in guarded files.

## Validation

- 25 targeted tests: six palette/mode combinations for text and focus contrast; theme persistence/System/storage failures/key changes; dialog nesting, Escape, focus and backdrop behavior; Training loading/error/empty/unavailable/unknown-statistics/resume and ID-based actions.
- Typecheck and focused ESLint pass.
- Optimized Next build passes in a separate output directory with local placeholder public Supabase configuration. First attempt compiled but failed prerender because the shell had no Supabase configuration; the rerun supplied the same local preview configuration. No database changes or deployment. Existing Next warnings about re-exported API route config remain outside this slice.
- Browser: all six Training palettes captured; Graphite Dark Library, expanded meaning, filters, Escape/Back and opener focus; Graphite Dark builder and Statistics; Blue Dark mobile Settings/Appearance/Training at 430×932, no horizontal overflow; persisted Blue Dark survives reload. Corrected disappearing collapsed-section tint, an unthemed Variations dock and light scrollbar gutter in dark mode.
- Screenshots: `/Users/khrustal/.codex/visualizations/2026/09/29/practice-themes/`.

This is not a complete WCAG certification, cross-browser release suite, backend integration test or production-data validation. Disabled controls and every decorative border are not covered by the declared-pair contrast test.

## Remaining gates before rollout

| Priority | Finding / owner | Required integration work |
| --- | --- | --- |
| P1 | Demo data and actions / UI adapters + platform | Replace mock statistics, source availability, preview session launch and in-memory saved training with existing platform contracts. Handle loading, error, empty, unavailable and stale requests. Never derive learning state from UI fixtures. |
| P1 | Broad prototype orchestrator and style cascades / UI | Freeze the approved recipe and extract remaining Library, builder, Settings and Statistics by domain with characterization tests. Shared tokens are ready; `BuilderPrototype` and the entire variations bundle are not a production component. |
| P1 | Word details and language support / dictionary adapter | Consume canonical word-details projection, preserving meaning/expression scope and identity. Do not flatten synonyms to a headword or claim demo translations/forms exist for every language. |
| P1 | Preference ownership / app shell | Theme now persists locally. Other settings and saved-training choices remain prototype state. Define device vs account preference ownership; resolve persisted/System theme before SSR first paint to avoid a default-theme flash. |
| P1 | Localization / UI | Most approved preview labels are English; wire the existing localization layer and stable language/source IDs before production. Do not use displayed language names as API identities. |
| P2 | Packaging and CSS debt / UI | Comparison-only Radix imports, unused variants, long cascading prototype styles and old `!important` rules remain in dev. Drop them from the production import graph. The dev route is intentionally unavailable in production despite compiling into the build. |
| P2 | Full accessibility and device validation / QA | Verify production route with keyboard, screen reader, zoom, long translated names, iOS/Android drag/scroll, reduced motion and real loading/error states. Current checks cover the new shared behavior and representative Chromium layouts. |

The next rollout slice should mount the shared Training presentation behind the existing frontend boundary with a real read-only data adapter, then connect launch/resume/edit actions to established controllers. This keeps scheduling, persistence and provenance in their existing owners rather than turning the visual prototype into another backend.

### 2026-09-29 — active training presentation checkpoint

Implemented the agreed session preview: frameless progress header, mobile focus mode, grading and completion, in-tab pause/resume, shared recent activity from Training and Statistics, and the exact Library article renderer inside the shared PracticePanel. All new colors/type consume practice tokens. The session preview remains dev-only; see `apps/ui/docs/practice-presentation.md` for integration boundaries and unsupported production operations. Validation: 31 focused tests, typecheck, targeted lint and style guard; desktop/mobile/light/dark IAB checks. Local DB health warning blocks claims about real API integration, not this fixture demonstration. No deploy or production runtime changes.

### 2026-09-29 — typography, rating and motion follow-up

Added shared WordIdentity and RatingControls, actual EN/NL/RU label-fit measurement, slim visual controls with full touch targets, and Training Variations. Shared definitions use the larger reading face; relations align with examples. Secondary panels now have directional full-travel enter/exit and reduced-motion dismissal. 37 focused tests and type/lint/style checks passed; browser screenshots and precise checks recorded in practice-presentation.md. DB diagnostic is no longer a vague mismatch: see `docs/tech-debt/local-qa-contract-2026-09-29.md` for the read-only ledger failure and separate missing search index. Backend repair remains open.

### 2026-09-29 — bounded session and reveal sequencing

Kept session controls visible at all tested viewport sizes; only answer details scroll, using the Library viewport component. Grouped translations by their source and aligned form facts. Added source-text movement on reveal, reduced-motion handling and grading guard. Full article enters collapsed, then opens only the current meaning by identity. 20 focused tests, typecheck, lint/style guard passed; browser evidence and remaining integration limits are in `apps/ui/docs/practice-presentation.md`. Prototype only, no deployment or backend mutation.

### 2026-09-29 — session rating density and secondary actions

Approved session density now adapts between 46 px / one row and 28 px / two rows. Added quiet Report / Exclude footer using shared Library menu and report dialog. Known and excluded remain distinct local preview marks with Undo; production API integration is still pending. Library compact controls and read-only training lookup remain scoped separately. 22 focused tests, typecheck, lint, style guard and desktop/mobile browser checks passed. No deployment or DB changes.

### Committed design checkpoint — 2026-09-29

The approved prototype is checkpointed on `codex/407-builder-prototype` in separate shared-presentation, prototype-integration and DB-diagnostic commits. Final pre-commit validation: all 43 focused tests across six suites, UI typecheck, ESLint over the entire prototype and shared practice components, semantic style guard and whitespace checks passed. Existing test-environment warnings (React 18 boolean inert, Vite CJS deprecation, Node localStorage) remain documented; no failing checks. Production integration gates above remain open. This checkpoint does not deploy the preview or repair the local DB.
