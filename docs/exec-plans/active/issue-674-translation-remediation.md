# #674 / #655 — Translation remediation and release

Owner: current Codex session, user-authorized implementation and production release.
Accepted: [2026-10-13](../../discussions/2026-10-13-02-translation-remediation-release.md).
Branch: codex/674-translation-audit. Base: ffa3c0b3; audit: 47929cac.

## Plan

- [x] Make context readiness refresh the authoritative direction-specific answer lookup; preserve cancellation, source identity, review direction and progress.
- [x] Compute actual requested-field completeness in the read-only server projection; expose existing repair capability for incomplete/stale artifacts, retaining usable partial display.
- [x] Audit and repair ordinary, word-context, sentence, idiom, Library, initialGroup and prefetch paths; successful preparation invalidates stale browser lookups and visible cards revalidate before relying on an old snapshot.
- [x] Promote context-aware equivalents prompt, retain an exact v8/high rollback profile, verify prompt/cache identity and targeted quality cases.
- [ ] Run focused regressions, typecheck/lint, full unit suite once, relevant local browser coverage; perform standards/spec review and fix findings.
- [ ] Create reviewed PR, pass CI, merge and deploy through the established workflow; verify exact image/commit, DB compatibility and worker health; preserve rollback instructions.
- [ ] Update logbook, sync reference main and retire the finished checkout after preserving evidence.

## Boundaries

Runtime ownership: apps/ui translation domain, Platform projection/preparation clients,
training and Library lifecycle. No DB migration or scheduling/progress change planned.
Use the existing queue and its fencing/retry policy. Read-only lookup never enqueues.
Do not introduce broad refactors or a new translation execution path.
Do not bulk regenerate production translations. Extensive new-vs-old card comparisons
remain a separately requested user follow-up.

## Validation and rollback

The two audit tests must become ordinary passing tests. Cover cache/source/prompt
identity, partial artifacts, delayed preparation, late responses after card changes,
read-only scopes, wrong-direction state and stable frozen examples. Existing local
DB queue tests remain authoritative for unchanged queue ownership/fencing.
Prompt rollback must restore the exact previous v8/high fingerprint, not merely
reuse the name with modified bytes. Application rollback uses the prior immutable
image with the unchanged compatible DB contract and matching worker.

## Checkpoints

Implementation started. Audit regressions and small prompt experiment are preserved
under /Users/khrustal/adhoc/2000nl-research-archives/674-translation-audit-2026-10-13/.

Validation checkpoint: 2313 unit tests passed (356 skipped); six relevant Playwright scenarios passed. Typecheck passed; lint has only the existing audio-effect dependency warning. Local QA health is ok/local with contract 223. A pre-existing local 222 receipt / 223 schema mismatch was repaired through the canonical migration gate after preserving a full dump and both ready queue jobs; local row counts were unchanged. Private repair evidence: /Users/khrustal/adhoc/2000nl-research-archives/674-local-qa-repair-2026-10-13/.
