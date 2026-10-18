# #712 — clear empty training and calculate-before-start

Owner: Codex chat with repository owner. Branch `codex/712-empty-training-explanation`, PR #749.

## Accepted release scope

Owner explicitly requested deployment, then confirmed finite sessions with separate Review ahead are sufficient for now. [Final labels and semantics](../../discussions/2026-10-18-07-all-available-cards.md) supersede the ∞ preview. Continuous cycling #468 is not part of this release.

- Home: Change mix with concise adjacent «Повторений сейчас нет. Новые карточки выключены.»; open Session without changing settings. Retain draft/language-scoped authoritative empty-start recovery.
- Existing sliders remain. Size stops 5/10/20/30/40/50/All; full label «Все доступные карточки». Preserve old numeric saved sizes. Size and mix independent; reuse existing finite all-available server selection, including permitted new/review categories. Existing reviews-only presets stay reviews-only.
- No live availability reads in the editor, no dynamic explanatory paragraphs that move the sliders. Reserve label/summary geometry and maintain mobile section widths.
- Calculate training saves/selects the edited recipe and returns to the overview availability read. Starting cards is a separate overview action. Save failures retain the editor and draft.
- No DB migrations, FSRS changes, access-policy changes or continuous mode.

## Validation and release

Local Supabase on 3100, contract 228. Browser confirmed mixed all-available keeps the mix, calculates 0/0/1 and offers separate Start. No personal production progress or grading. Evidence: `/tmp/2000nl-712-qa/all-available-cards.png`.

52 TrainingTodaySetup and 11 size-picker tests passed. Disposable local FSRS database: 377 tests in 42 files passed, including existing all-available new-card planning and early-review coverage. Typecheck passed. Full hosted unit run on fbf444f7: 2527 passed. Full browser run: 223 passed, 3 passed on retry, 4 skipped; one reproducible 320×568 home overflow failed. That overflow is fixed in the final short-phone spacing CSS. The exact desktop/mobile failing file passes locally (2/2), and the builder footer and completion/restart files pass (8/8). 320/390 manual geometry checks show less than 0.02px movement between finite/all-available sizes after reserving narrow summary height.

The final followups only change responsive CSS, validated against the exact affected browser scenarios; no repeat of unrelated suites is needed for those CSS edits. Required branch checks (production dependency security and release-boundary) must pass on the merge head, without bypass. The automatic full workflow may continue in parallel; report its actual state rather than claiming a green workflow from scoped results.

## Lifecycle

Keep the active 3100 preview worktree while the owner uses it. After merge, verify deployed build/health and sync reference main using the repository wrapper. Review retirement separately; do not remove a running checkout or research checkout 603.
