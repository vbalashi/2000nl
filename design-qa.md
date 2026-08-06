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
