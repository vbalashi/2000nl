# Activate durable dictionary translation jobs

2026-10-11. Owner requested production rollout of PR #675 and the working background model. Accepted: release the reviewed default-off implementation first, then activate migration 223 through the normal exact-checksum NUC manifest and enable the server-only jobs flag in the deploy environment. No hold is bypassed. The worker must become healthy from the matching immutable image before UI switches; deep health must confirm the same release and contract.

Prompt, token budgets and model configuration remain unchanged. Semantic partitions remain deferred because the owner verified that the longest articles translate with the released full-context prompt. Queue work does not alter session membership, progress, grades or FSRS.

Rollback keeps the additive migration and restores the previous UI image. First activation disables jobs if the previous release had no worker. Later rollback restores the compatible worker and UI together. No bulk regeneration is part of activation.

Validation: full local contract-222 probe chain plus queue privacy, grants, identity/lease constraints, claim limits/recovery and atomic-publication fences. Probe-only negative tests reject missing UPDATE privilege and missing function search_path, then roll back. The initial negative harness mistakenly included a legacy probe with COMMIT, so local grants/configuration were explicitly restored before running isolated negative probes; production was never involved. The final complete probe chain passes on the restored local DB. Independent operational review found no activation blocker.
