# #674 / #655 — Translation remediation and release

Owner: current Codex session, user-authorized implementation and production release.
Accepted: [2026-10-13](../../discussions/2026-10-13-02-translation-remediation-release.md).
Branch: codex/674-translation-audit. Base: ffa3c0b3; audit: 47929cac.

## Plan

- [x] Make context readiness refresh the authoritative direction-specific answer lookup; preserve cancellation, source identity, review direction and progress.
- [x] Compute actual requested-field completeness in the read-only server projection; expose existing repair capability for incomplete/stale artifacts, retaining usable partial display.
- [x] Audit and repair ordinary, word-context, sentence, idiom, Library, initialGroup and prefetch paths; successful preparation invalidates stale browser lookups and visible cards revalidate before relying on an old snapshot.
- [x] Promote context-aware equivalents prompt, retain an exact v8/high rollback profile, verify prompt/cache identity and targeted quality cases.
- [x] Run focused regressions, typecheck/lint, full unit suite once, relevant local browser coverage; perform standards/spec review and fix findings.
- [x] Create reviewed PR, pass CI, merge and deploy through the established workflow; verify exact image/commit, DB compatibility and worker health; preserve rollback instructions.
- [x] Update logbook, sync reference main and retire the finished checkout after preserving evidence.

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

Standards review: one loading-error recovery finding, corrected with a regression; no architectural breaches. Spec review: no outstanding implementation findings after that correction. Browser dev-login reaches authenticated local Training. Deployment and lifecycle checkpoints remain pending.

## Released checkpoint — 2026-10-13

PR #679 merged as ffaff5b95355bef67c3eb31fd64cdfaab8da2b82; standard deployment38428533773 succeeded. Production0.18.1284, deep health ok, DB223 compatible, UI and healthy worker on the same exact image. Both use v11/high provider revision6a0e11c8e9f54e90ceea0208424373b55b8f7e06d65ccf58a131b6a871d522c6. One bounded public paal RU queue smoke completed on attempt1 with8/8 requested fields, matching current cache identity. No learning state changed or bulk regeneration performed.

CI:2314 unit tests,180 platform API tests; browser sets217+29+17 passed. Independent Standards finding corrected and re-reviewed; Spec has no outstanding findings. Previous image d253a8316f54cdbfeade900a959618a847859ccf preserved under rollback-ffaff5b95355bef67c3eb31fd64cdfaab8da2b82. Exact prompt-only rollback remains luna6-v8-high.

Evidence: /Users/khrustal/adhoc/2000nl-research-archives/674-translation-release-2026-10-13/ (checks, CI/deploy logs, health and smoke receipts with SHA256SUMS). Logbook records release and retirement. Original implementation branch retained at02f40dc1 for recovery; release checkpoint branch carries this documentation. Reference sync and checkout retirement follow this documentation merge; completion is confirmed in the local logbook. Broad old/new comparisons remain user-deferred.
