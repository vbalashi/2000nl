# Audit remediation: coordination #735 / #736 / #737

Status: implementation started, not release-approved or deployed.

[Owner authorization](../../discussions/2026-10-17-10-audit-remediation-coordination.md).
The parent Codex agent coordinates implementation, independent review and
validation. Runtime edits on reference main are forbidden.

## Ownership

Base: `e4d82d00addae8f5d49efb74e299c5dd2b88b8c9`.

| Issue | Checkout / branch suffix | Owner |
| --- | --- | --- |
| #735 | `735-connect-session-hardening` | `connect_implementation`: Connect/auth/consent and migration229 |
| #736 | `736-sentence-recovery` | `sentence_implementation`: pending/recovery component regression and fix |
| #737 | `737-stats-work-parity` | `stats_implementation`: disposable DB parity/measurement and justified migration230 |

Paths are under `/Users/khrustal/dev/2000nl/.worktrees/`, branches use `codex/`.
Each was created through the repository wrapper with independent UI dependencies.
No suitable existing checkout covered these scopes; no existing checkout was
removed or reset. The curator owns this file, the authorization discussion,
shared documentation indices and external logbook. Workers preserve others' edits.

## Gates

1. Concrete scoped design and failing behavior at agreed public interfaces.
2. Connect: negative route/principal/session tests, local DB trust checks,
   consumer compatibility and historical-session transition. No public security
   details or patch publication before coordinated review.
3. Sentence: actual session/recovery/events with external transport/loader
   injection. Bounded pending reads, join/reconnect, identity/terminal transitions,
   stale completions; no renderer redesign or generic Training engine.
4. SQL: exact projection parity for both overloads against independent baseline,
   effective exclusions through217, local04:00/DST/access/list/known/frozen cases.
   Measure disposable fixtures only; never reset the canonical local DB.
5. Separate standards/spec reviews against pinned base plus specialist security/DB
   review. Narrow tests, typecheck/lint and final full unit suite as applicable;
   SQL changes additionally require meaningful RPC/FSRS validation.
6. Exact manifest checksums/postflight and explicit dependency holds before any
   approved rollout. Local preparation does not authorize production mutation.

## Release and retirement

Use separate reviewable changes, with Connect first in release priority. Safer
new issuance is not full closure without verified historical-access handling.
Record exact commits, checks, limits and next owner at checkpoints. After an
approved release: deployment verification → reference sync → evidence/ownership/
process checks → retire only eligible finished worktrees. Dirty, active or
evidence-owning checkouts must be preserved.
