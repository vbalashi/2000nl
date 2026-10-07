# Bounded retirement release readiness

Date: 2026-10-08 (discussion began late on 2026-10-07 Amsterdam). Source: owner discussion in Codex, explicit authorization to set a finite goal and delegate.

The owner approved a bounded follow-up to the [UI retirement](2026-10-07-01-ui-retirement-and-refactor.md). The goal is a reviewable release-readiness decision for PR #611, not continuing architecture decomposition indefinitely.

Accepted scope: classify full browser failures against accepted approved-UI contracts; remove three known style-audit violations while preserving appearance and neutral startup; fix confirmed relevant focus/reveal/viewport defects or outdated test assumptions; run the necessary checks and independent review. Preserve selection, lookup, learning/session authority, accessibility and overflow expectations. Do not weaken tests or increase debt allowances to obtain green checks.

Stop boundary: once relevant changes are integrated and validated, provide an explicit ready/not-ready verdict and a finite list of independently scoped remaining blockers. Large unrelated product/backend defects become follow-up issues rather than expanding this cleanup. Further Library/TrainingScreen extraction, merge and deployment are outside this goal. Approval of this work does not authorize a release.

Execution remains under issue #610 and draft PR #611; root owns integration and verdict. Luna handles style/token and test inventory/migration, Sol handles coupled focus/reveal behavior and independent review. Implementation status and final evidence live in the execution plan.
