# Owner visual corrections — round 4

2026-10-01. Two owner comments, UI presentation only.

1. Added shared AddAction for saved Training creation and Settings language addition: same Inter token, muted colour, 16px Plus, spacing, disabled/focus states. Mobile label size 11px normal.
2. Added shared SegmentedControl for SettingsOptions and ApprovedTextSizeSection. Mode and text-size controls now share geometry, typography, selected/focus/disabled states. Appearance rows keep labels left and controls right on mobile and desktop; palette cards align to the same right edge. Theme cards retain real palette swatches with smaller consistent labels. Other mobile Settings row controls align right.

Validation: typecheck; approvedSettingsDestination, previewTextSize and TrainingOverview component suites; lint has only existing handlePlayAudio dependency warning. Browser 472, 564 and 1100px widths. Mode and text-size right edges: 452px at 472 viewport, 984px at 1100 viewport. No account preferences changed during verification.

Evidence: /Users/khrustal/adhoc/2000nl-407-visual-evidence/r4-appearance.png. Owner visual approval remains open.
