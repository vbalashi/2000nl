# PR #605 follow-up: syllable memory and mobile page scroll

Owner: issue #606. Scope: existing account interaction preferences and AppFrame.

## Behavior

- Headwords default to plain text. Available pronunciation separators are
  displayed only when both double-tap and the remembered display choice are on.
- Double-tap/double-click immediately changes a shared account choice. Saves
  are serialized so rapid toggles finish with the last chosen display. Failed
  saves restore the last confirmed value. No browser-local preference is used.
- The choice applies to ordinary direct/reverse cards and headwords in idiom
  and contextual exercise answers. Headwords without syllable data do not
  expose a gesture. Disabling the gesture always renders plain headwords;
  re-enabling restores the remembered choice.
- The mounted AppFrame constrains html/body to the dynamic viewport and
  disables root overscroll. Inner card and other existing content scroll areas
  remain scrollable. The training header and action footer stay visible.

## Validation

- Local DB contract 213 migration and read-only structural probes pass.
- Disposable database suite: 38 files / 351 tests pass, including persistence
  and account isolation under existing user_settings RLS.
- Focused component tests cover defaults, new sessions, simultaneous words,
  rapid saves, disabled gesture, touch double-tap/drag discrimination, keyboard,
  and idiom/context pronunciation projection.
- Focused UI suite: 8 files / 129 tests pass. Browser suite: 10 scenarios
  pass (2 phone scroll, 2 navigation, 6 EN/NL/RU reflow).
- Typecheck passes; lint retains the existing handlePlayAudio dependency warning.
- Chromium phone smoke via local dev-login checks compact and long answers,
  root scroll locking and internal scroll at 393px width with dynamic height.
- Existing EN/NL/RU Extra reflow scenarios pass at 844x390 and 640x400.

Actual phone browser elastic scrolling still needs owner confirmation on the
reported device after publication; emulation verifies layout and scroll ownership.
