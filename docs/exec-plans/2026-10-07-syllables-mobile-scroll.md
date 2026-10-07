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
- Focused UI suite: 9 files / 149 tests pass, including preservation of
  invisible wrap points when the canonical word differs from pronunciation. Browser suite: 10 scenarios
  pass (2 phone scroll, 2 navigation, 6 EN/NL/RU reflow).
- Typecheck passes; lint retains the existing handlePlayAudio dependency warning.
- Chromium phone smoke via local dev-login checks compact and long answers,
  root scroll locking and internal scroll at 393px width with dynamic height.
- Existing EN/NL/RU Extra reflow scenarios pass at 844x390 and 640x400.

Actual phone browser elastic scrolling still needs owner confirmation on the
reported device after publication; emulation verifies layout and scroll ownership.

## Long headword fitting

Measured rendered headword markup (including syllable separators) is fitted
against available row width after fonts load and viewport changes. If the
article prevents a whole word fitting, it gets a separate preceding line.
Then the headword scales down to a floor of 20px / 60% of its preset size.
Larger compounds retain invisible wrap opportunities below that floor.
Single-line fits suppress wbr elements so inline syllable fragments do not
wrap unexpectedly. Phrases retain their regular layout.

Manual browser measurements cover arbeidsongeschiktheidsverzekering,
verantwoordelijkheid and ziekenhuis at 320 / 390 / 768px, both sides, with
and without syllable dots. At 390px all three remain one line; the longest
compound uses the same size on Face and Answer. At 320px the longest
compound falls back to two lines. A dev-only comparison is at /dev/headword-fit.
Three browser regression scenarios plus the existing 8 scroll/reflow scenarios
pass. The relevant component suite passes (53 tests); typecheck and lint pass
with the previously recorded handlePlayAudio warning.


## Post-publication headword-fit verification

PR #607 was deployed as a5a0cf0cb33650c4440fce7d46295e3e855e4d21, production 0.18.1186, contract 213. Production deep health passed. The delayed GitHub browser suite found stale expectations for dotted accessible names, root overflow and the article-above layout, plus two fitting defects: inherited reading-size changes did not remeasure an inline-sized heading; the article did not scale with the fitted word. The follow-up observes inherited preference attributes and preserves the original article/word size ratio. It updates browser assertions to canonical accessible names, the fixed root viewport and headword-lockup geometry including a stacked article. Reading settings mocks accept either local loopback hostname.

Local verification: 61 classic-runtime browser scenarios passed, followed by all 18 revised long Word Details cases (320/390/1440px, three sizes, two themes). Approved-runtime headword-fit cases pass at 320/390/768px. Typecheck and lint pass with the existing TrainingSenseCardV2Session warning.
