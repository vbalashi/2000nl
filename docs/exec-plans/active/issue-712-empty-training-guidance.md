# #712 — minimal home guidance, owner preview

Owner: Codex chat with repository owner. Branch `codex/712-empty-training-explanation`.
PR #749 is held for owner visual review; no merge/deployment authorized.

## Current accepted scope

[Final accepted decision](../../discussions/2026-10-18-03-minimal-home-training-guidance.md)
supersedes the earlier editor-counter and editor-guidance proposals.

Home: one Change mix action and concise adjacent explanation for a review-only
selection with new cards available. Russian copy: «Изменить состав» and
«Повторений сейчас нет. Новые карточки выключены.» Counter-caption font, slightly
stronger contrast. Existing Session opens with its original two sliders.

Restore the original editor: no new hints/counters/dropdowns, no live draft reads,
no changes to slider labels, Start or Save. Preserve authoritative empty-start
explanations and scope them to the attempted language/canonical draft so corrected
presets are not blocked by old results. No DB/scheduler/access-policy changes.

## Validation and local preview

Existing project-local issue checkout reused. Local UI port 3100, deep health
healthy/local, DB contract 228. Dedicated local test preset has 0/0/1: the concise
home state is real local data, not mocked counts. Change mix opened Session with
both original sliders and no new paragraphs. No ratings performed.

The four focused test files passed except one obsolete copy assertion on the
first run; that assertion was updated and all 33 Overview tests then passed.
The remaining 71 cases passed on the same implementation. Typecheck passed;
lint passed with the pre-existing unrelated handlePlayAudio hook warning.

Final preview screenshots: `/tmp/2000nl-712-qa/final-minimal-home.png` and
`final-original-sliders.png`, also retained under ignored `tmp/issue-712-qa/`.
All preceding editor-counter/hint screenshots and the unselected generated
concepts are rejected iterations, not implementation targets.

## Checkpoints

Worktree remains active for owner preview; keep the 3100 preview running. No
reference-main edits, merge, rollout, reference sync or retirement at this stage.
Research checkout 603 remains untouched. After owner review, review the final PR
and checks before separately deciding deployment.
