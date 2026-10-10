# #657 — isolated translation evaluation

Owner: this Codex chat. Issue: https://github.com/vbalashi/2000nl/issues/657.
Checkout: `.worktrees/657-translation-eval`; branch: `codex/657-translation-eval`.
Base: `4c5d0f266be3`. Related: sprint #655, independent headword UI PR #656.

Owning layer: offline translation evaluation (`Research/translation-eval` plus
`apps/ui/scripts/translation-eval`). Existing production translation parser is
reused; runtime prompts/models, DB, scheduler and article generation are unchanged.

## Scope and validation

- [x] Read previous translation prompt incidents, structured artifacts, historical
  prompt revisions, article-generation A–L plan and current #603 research lessons.
- [x] Read-only aggregate dictionary-cache audit; no learner-state access/writes.
- [x] Trace parser/artifact/coordinator/projection/Training/Library alternatives.
- [x] Preserve 48 original-fixture GPT-4.1 A/B results and rejected v2 candidate.
- [x] Dedicated frozen inputs/prompts/profiles/runs/reviews/comparison workspace.
- [x] Tests for immutable snapshots, idempotent resume, failed/unknown attempts,
  endpoint/model binding, control words and baseText regression.
- [ ] Three-model preflight, same candidate on development and fresh validation.
- [ ] Safe evidence/report, semantic review checkpoint, PR and logbook update.

Review/release is separate. The active evidence-owning checkout must be retained;
no retirement or reference-main merge is part of the research checkpoint.
