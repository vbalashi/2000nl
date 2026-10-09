# #636 — iPhone training dictionary safe area

2026-10-09. Owner: current Codex chat. Branch: `codex/636-iphone-dictionary`.
Base: `98896ded1f43`. UI ownership: shared `PracticePanel` geometry.

## Finding and correction

Opening word details from training uses the shared native dialog. Its mobile
height subtracted only 12px from the dynamic viewport, ignoring the top OS inset.
With a 59px status/notch area the header close control overlapped system chrome.
The new browser geometry check failed before the fix (close y=24, required >=59).

The panel now subtracts max(12px, safe-area-inset-top), includes padding/border in
its height, and respects horizontal and bottom OS insets. Desktop/landscape
panels also respect safe-area edges. No learning or scheduler behavior changes.

`Leren` absence is existing intended capability behavior, rather than a special
case based on which meaning opened the drawer. `senseCardV2.ts` projects
start-learning for not-started/encountered states; learning/reviewing states get
review capabilities. Training More suppresses inline grades, so an enrolled
meaning has no primary button while a new sibling still has Learn. Regression
coverage asserts this and that opening/expanding details causes no mutation.

## Validation and limits

- 45 component/unit checks passed across LibrarySenseCardV2Session,
  LibraryMeaningActions, approvedArticleDialogs.
- 3 existing full word-panel sequence tests passed (320/390/1024px).
- New browser tests cover two portrait profiles, landscape, OS inset geometry,
  dynamic viewport resize, touch dismissal and restoration of the same answer.
- Typecheck passed. Lint passed with an existing handlePlayAudio dependency
  warning in TrainingSenseCardV2Session.tsx.
- Browser checks use mocked training data. Insets are explicitly substituted in
  the shipped CSS because desktop device emulation returns zero env() insets.
  Physical iPhone/Safari verification remains a release check.

## Lifecycle

Preserve this checkout while the PR awaits review and release verification.
No production deployment, reference-main sync or retirement is claimed.
After reviewed merge: verify the iPhone flow, sync reference main, then retire
only after checking ignored evidence, dirty files and active processes.
