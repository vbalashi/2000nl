# Training secondary actions — 2026-09-06

Owner: [#251](https://github.com/vbalashi/2000nl/issues/251).
Implementation: [PR #260](https://github.com/vbalashi/2000nl/pull/260), stacked
on #258. Base `3a41dd552a86ee8651b17a4c6e897020c2d72389`; runtime change
`6b37adb2`. This is the action-row slice, not adoption of the full session shell.

## Reproduced cause and fix

Owner saw Melden below Markeer als bekend. The height prototype used a 14px
stub against a 24px Known button, bottom-aligned: centers differed by 5px.
The real Report trigger was 32px against Known 24px, also bottom-aligned:
the committed browser regression failed with a 4px center mismatch before
the fix. Testing only the simplified prototype would have missed this second
shape of the same defect.

Face and Answer now use one centered secondary row. Both actual actions use
one shared quiet presentation class: height24px, Inter11.5px, normal weight,
single-line label, no hover background or border, visible keyboard focus ring.
Report callbacks, frozen diagnostic context, modal and focus return are unchanged.
Library keeps its current active button appearance; it is a separate consumer,
not a retained obsolete Training renderer.

## Validation

- Typecheck and lint passed.
- Full unit/component suite:905 passed,123 DB-dependent skipped.
- Real-browser regression:6/6 passed (390/834/1440px × light/dark), each
  checking Face and Answer: action centers and text tops differ by less than1px,
  labels do not overlap, computed typography/color match, hover remains quiet,
  keyboard focus is visible and Report → Back preserves side and restores focus.
- Independent Standards/architecture/refactoring review: no material findings.
- Independent Spec review: no missing/incorrect bounded implementation or scope
  creep; disabled wiring unchanged, no new dedicated browser assertion for it.
- Isolated Chromium, no authentication/storage reuse; API/external requests
  blocked. Screenshots use real fonts and assert the selected root theme.
  The initial capture caught an OS/theme-effect mismatch; those images were
  replaced only after setting the browser theme and rerunning all checks.

Run the checked-in test using the standard Playwright configuration when3100
is free, or a local test config with the existing fixture-only server:

```sh
cd apps/ui
npx playwright test playwright/tests/training-secondary-actions.spec.ts
```

| Width | Face | Answer |
| --- | --- | --- |
|390 dark|[Dock](assets/actions-390-dark-face.png)|[Dock](assets/actions-390-dark-answer.png)|
|390 light|[Dock](assets/actions-390-light-face.png)|[Dock](assets/actions-390-light-answer.png)|
|834 dark|[Dock](assets/actions-834-dark-face.png)|[Dock](assets/actions-834-dark-answer.png)|
|834 light|[Dock](assets/actions-834-light-face.png)|[Dock](assets/actions-834-light-answer.png)|
|1440 dark|[Dock](assets/actions-1440-dark-face.png)|[Dock](assets/actions-1440-dark-answer.png)|
|1440 light|[Dock](assets/actions-1440-light-face.png)|[Dock](assets/actions-1440-light-answer.png)|

These are dock crops, not full-screen, physical-mobile, full accessibility or
authenticated Training acceptance. Header/session/footer migration, short-height
and safe-area checks remain under #251. Height B owner acceptance is recorded
separately in #249/PR #259; the temporary prototype must not be deployed as a
second session renderer. No production or DB changes were made in this slice.
