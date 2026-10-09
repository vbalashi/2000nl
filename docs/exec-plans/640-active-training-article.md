# #640 — Active training article status and hint

Accepted design: [discussion](../discussions/2026-10-09-01-active-training-article.md).
Owner: UI article/session adapters and learning-action hooks. No DB/FSRS changes.

Implemented the wide noninteractive status/hint in RU/EN/NL. The original
training entry identity remains protected while another meaning is selected.
Learn, grades, Known, exclusion and resume cannot mutate the active entry from
this article. Sibling entry capabilities remain available. Word-wide exclusion
and restoring a shared exclusion are blocked because they affect the active
entry; an unknown original headword identity fails closed for those actions.
Reading, audio, translation, collections, progress inspection and reporting
remain available. The article does not expose the global exclusion undo notice.
This is a local UX guard, not cross-tab/server conflict enforcement.

Validation (2026-10-09):
- 65 unit/component tests across six relevant files passed.
- Six Playwright scenarios passed: RU 320px / NL 390px / EN 1024px with extra
  reading size, plus existing word-panel enter/close/focus scenarios.
- Browser tests exercise the real training controller with mocked platform
  responses, disabled-menu explanations, sibling actions, zero learning writes,
  original answer restoration and focus. Hook/modal tests cover resume bypasses.
- Typecheck and lint passed; existing audio-effect dependency warning remains.
- Reviewed the 320px screenshot: status and wrapped hint fit without overflow.
- Physical iPhone/WebKit and production have not been checked in this change.

Test setup corrections: route prefetch overwrote a mutable test entry ID, so
active entry lookup now uses its notice. Menu tests wait for scroll completion
before opening the menu (captured scroll normally dismisses it). Concurrent
Next startup/typecheck raced generated .next types; sequential typecheck passed.

Safe-area #636/PR #637 and menu flicker #638/PR #639 remain separate changes.
This branch is independently deployable and does not claim either fix.

Checkpoint: preserve .worktrees/640-active-training-hint and screenshot evidence
until PR review/merge/release verification. No deployment, reference-main sync
or worktree retirement before that checkpoint.
