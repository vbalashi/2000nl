# Design QA — 2000NL Library SenseCard correction

Status: PASS for owner review  
Date: 2026-08-06

## Comparison

- Source: Pen `30.50.02 · LIBRARY / TWO-PANE WORD DETAIL`, focused card node
  `l2e1m`, exported to
  `/Users/khrustal/adhoc/2000nl-library-canonical-audit-2026-08-06/l2e1m.png`.
- Source interaction: Pen `30.50.05 · LIBRARY / COLLECTIONS PICKER · MEANING 1`,
  node `N28YlY`, exported beside the card source.
- Implementation desktop:
  `docs/architecture/evidence/sensecard-v1-cross-product/screenshots/2000nl-library-canonical-desktop.png`.
- Implementation mobile:
  `docs/architecture/evidence/sensecard-v1-cross-product/screenshots/2000nl-library-canonical-mobile.png`.
- Implementation collection picker:
  `docs/architecture/evidence/sensecard-v1-cross-product/screenshots/2000nl-library-collections-picker.png`.

The source and desktop implementation were inspected together in one visual
comparison at the same expanded first-meaning and translation-visible state.

## Result

- PASS: Training grade controls no longer appear in Library.
- PASS: actions address one exact meaning/entry; collection counts are
  meaning-local.
- PASS: the collection picker opens, filters lists, toggles membership, creates
  a list and closes through visible controls.
- PASS: single/multi-sense structure, headword lockup, optional sections and
  collapsed second meaning remain intact.
- PASS: mobile 390×844 has no horizontal overflow; the action row wraps without
  clipping or losing accessible names.
- PASS: the Library view is intentionally richer than the compact approved
  SenseCard component while retaining the same semantic anatomy.

## Remaining non-blockers

- The durable report submission endpoint is not part of this slice. The report
  control is shown only where a typed `report-content` capability and handler
  are both available; no fake persistence is introduced.
- Fine spacing and icon polish remain owner-review work, not rollout blockers.

---

# Design QA — issue #124 Training SenseCard loop

## Evidence

- Source visual truth: `/Users/khrustal/dev/pens/2000nl-audiofilms.pen`, visible address `10.17.01 · COMPONENT · TRAININGCARD / PROMPT / FULL`; captured at `docs/architecture/evidence/issue-124/pen-10.17.01-face.png` (`761 × 409`, 1×).
- Rendered implementation: `http://localhost:3100/`, authenticated local pilot, captured at `docs/architecture/evidence/issue-124/implementation-face-desktop.jpg` (`1536 × 1646`, browser density 1×).
- Normalized comparison: `docs/architecture/evidence/issue-124/comparison-face.png` (`1521 × 570`). The implementation stage was cropped to its visible desktop bounds (`736 × 570`); the Pen component was padded, not scaled, to retain 1× typography and geometry.
- State: desktop, dark direct `word-to-definition` face, real Van Dale entry `de bank`, hint off.

## Findings

No actionable P0/P1/P2 mismatch remains for this tracer slice.

- Fonts and typography: the implementation preserves the serif headword/article lockup and the compact sans/mono control hierarchy. The browser uses responsive type sizing inside the real application shell; the Pen source is a fixed-size component fixture. The resulting optical hierarchy remains equivalent.
- Spacing and layout rhythm: the headword remains centered, the face and answer use one stable shell height, and the action dock stays in a stable location. The implementation shell is taller than the component-only Pen fixture because the accepted real-screen contract uses the available training viewport; this is an intentional screen constraint, not card-anatomy drift.
- Colors and visual tokens: dark card surface, quiet border, light serif headword, and indigo primary action match the source direction. Contrast remains sufficient in the captured state.
- Image quality and assets: this state has no raster imagery. UI symbols use the existing product icon components; no placeholder image or approximate decorative asset was introduced.
- Copy and content: copy is resolved through the selected interface locale. The Pen-only scenario/progress captions are not duplicated inside the card because the real 2000NL shell already owns session context and progress. This implements the approved removal of duplicate session controls.

## Full-view comparison evidence

The normalized side-by-side comparison confirms the same card silhouette, centered headword lockup, dark surface, and primary/secondary action hierarchy. The surrounding application shell remains light and independently owned, as intended by the shared SenseCard contract.

## Focused region comparison evidence

The face card and action dock are large and readable in `comparison-face.png`; no smaller crop was needed. The answer state was inspected separately in the live browser with real `bank` content because Pen `10.18.01` is a content-body component rather than the same full-screen state.

## Interaction evidence

- Today → Continue opens the V2 face.
- Hint can be toggled without changing the fixed shell.
- Show answer reveals the V2 answer and first-encounter actions.
- Space, I, T and H/J/K/L are owned by the V2 card while it is active; the
  legacy screen handler cannot reveal or grade a second, hidden card state.
- Start learning is accepted by Platform V2 and advances to the next card.
- Reverse mode shows the definition on the face and reveals the headword on answer.
- Reverse mode fails closed to the legacy presentation when the exact entry has
  no real definition; usage metadata is never substituted for the prompt and
  the headword is never exposed as a fallback answer.
- Multi-sense lookup selects the exact trained entry rather than reverting to the legacy card.
- The legacy inline training selector is absent while the Today/Setup rollout is active.
- The Training surface does not render a report action until a durable
  `report-content` handler exists; no visible control silently discards input.

Browser console/runtime: no unhandled runtime error was visible during the final cycle. The local grouped-search readiness warning disappeared after the documented search backfill completed.

## Comparison history

1. Initial browser pass fell back to the legacy card because the local grouped-search index had not been populated. No design judgment was made from that state.
2. The documented resumable local search backfill was completed. The same real entry then rendered through the V2 component.
3. Direct face, answer, mutation/next-card, reverse face/answer, and exact-entry selection were rechecked. No P0/P1/P2 visual issue remained.
4. Owner review exposed a shell-integration regression rather than a second
   card design: the legacy outer scroll region could retain an offset when Face
   changed to Answer, moving the stable V2 card beneath the application header.
   The V2 card now owns its internal scrolling and the outer region is clipped;
   the rich component anatomy remains the `418a108b` visual-contract baseline.
   At the measured 1280 × 720 owner-review viewport the outer scroll offset is
   `0`; the complete stage and known action end at 539 px while the owning
   region ends at 571 px, so the secondary action row remains visible.
   Evidence:
   `docs/architecture/evidence/issue-124/gate-answer-dense-1280.png` and
   `docs/architecture/evidence/issue-124/implementation-answer-fixed-1280.png`;
   the combined review input is
   `docs/architecture/evidence/issue-124/comparison-contract-vs-real-1280.png`.

## Follow-up polish

- P3: the Pen training components still carry `[WORKING]` labels even though the current runtime direction has owner approval; canvas status promotion should be handled as a separate governance edit rather than hidden inside this code slice.
- P3: translation/audio availability depends on the real entry capabilities and is intentionally absent when the Platform response does not advertise it.

## Final result

final result: passed

---

# Design QA — issue #134 responsive shell

Status: PASS
Date: 2026-08-11

## Evidence

- Approved source: Pen node `fhnVs`, `30.10.09 · MOBILE HEADER SELECTOR
  STATES · v0.1 · [REVIEW]`, exported to
  `/Users/khrustal/adhoc/2000nl-responsive-shell-audit-2026-08-11/fhnVs.png`.
- Mobile implementation, closed selector (390×844):
  `/Users/khrustal/adhoc/2000nl-responsive-shell-audit-2026-08-11/03-mobile-selector-closed.png`.
- Mobile implementation, open selector (390×844):
  `/Users/khrustal/adhoc/2000nl-responsive-shell-audit-2026-08-11/04-mobile-selector-open.png`.
- Desktop implementation (1440×900):
  `/Users/khrustal/adhoc/2000nl-responsive-shell-audit-2026-08-11/05-desktop-shell.png`.
- Narrow mobile implementation (320×844):
  `/Users/khrustal/adhoc/2000nl-responsive-shell-audit-2026-08-11/07-mobile-320.png`.
- Combined source/implementation comparison:
  `/Users/khrustal/adhoc/2000nl-responsive-shell-audit-2026-08-11/06-pen-vs-implementation.png`.

## Result

- PASS: the mobile header replaces the three peer labels with one 132×36
  destination selector and retains Theme + Settings as the only quick actions.
- PASS: the selector exposes localized accessible names, announces expanded
  state, moves focus with ArrowUp/ArrowDown/Home/End, restores trigger focus on
  Escape, and navigates to exact destinations.
- PASS: desktop retains Training / Library / Statistics with Lucide icons.
- PASS: account identity and Sign out are available inside Settings instead of
  a separate header action.
- PASS: the Training Report affordance is a native button with hover, focus,
  active, busy and keyboard behavior. Until a durable submission contract is
  implemented, activation returns explicit localized unavailable feedback
  instead of silently discarding the action.
- PASS: the separate bottom mobile navigation remains present. Its destination
  icons are hidden at this compact breakpoint, preserving the prior tab layout;
  measured width is 364/364 px with document width 390/390 px.
- PASS: at 320 px the compact logo and selector retain a measured 10.9 px gap;
  the bottom tabs measure 294/294 px and the document 320/320 px.
- PASS: no global Search, Help, History, or Account action remains in the
  responsive header. The legacy `R` shortcut and persisted pinned-History entry
  path are also removed; definition clicks resolve into Details rather than
  Recent. Recent remains reachable from the Answer-card details drawer.
- PASS: the five-step onboarding tour targets only controls that remain in the
  shell; removed Search and History targets are absent from both DOM and copy.
- PASS: a dictionary miss from an interactive card word produces localized
  visible `role=status` feedback instead of silently updating hidden history.

## Intentional differences

- The approved Pen reference uses English copy; the final browser check used
  the Russian interface. The fixed-width selector truncates the current Russian
  label in its closed state while the complete label remains available as its
  accessible name and in the open menu.
- Spacing between the session bar and Training card remains outside issue #134.

## Final result

final result: passed
