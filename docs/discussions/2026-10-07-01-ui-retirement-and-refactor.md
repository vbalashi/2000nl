# Retire legacy presentation and refactor by ownership

Date: 2026-10-07. Source: owner discussion in Codex, followed by explicit authorization to execute and delegate primarily to Luna, escalating difficult work to Sol with root architecture review.

The owner asked whether accumulated old UI and large TSX modules warrant cleanup. The accepted sequence is caller inventory, retirement of the old presentation, reassessment of remaining Setup/Library complexity, then characterized session-lifecycle decomposition. Preserve existing approved appearance and learning behavior. File length is evidence of possible mixed ownership, not a target metric.

Current evidence: origin/main 9aa380ea, also reported by public production health as release 0.18.1190 on 2026-10-07. Both presentation flags are enabled. Prior evidence: ../discovery/2026-10-01-presentation-retirement.md.

Accepted boundaries: apps/ui owns this cleanup. Retire only trainingPresentationV1/sharedArticlePresentationV1 toggles and verified old branches. Keep Platform capabilities, API compatibility, saved preferences, recovery of existing sessions, immutable migration history and learning identities. Characterize behavior before domain extraction. No redesign or scheduler changes.

Execution is tracked by #610 (child of #255), with separate worktrees and disjoint ownership for Training, Library and navigation. Root owns integration/configuration and review. Approval is not implementation: no release or merge is recorded by this decision. Additional domain extractions are chosen from evidence after deletion, not bundled speculatively into retirement.
