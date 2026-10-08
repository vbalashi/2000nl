# #612: finite-session telemetry and state ownership

Owner-approved bounded follow-up to merged #611; base6ff4cfdad3496d8a1b331a7efe1d6f0d91ca0f76. Worktree612-telemetry-owner. UI/test owning layer; server scheduling and mutation authority unchanged.

## Completion boundary

Three sequential review-ready slices, each characterized before extraction and independently reviewed:
- [ ] Telemetry: reproduce missing event, define accepted-action→distinct next-card/terminal transition identity; preserve failure/cancellation semantics, bounded redaction and1s desktop/mobile budget. Validate pure/component timing plus opt-in browser benchmark and injected-delay failure.
- [ ] Library: one search lifecycle owner for scope/freshness/request generation/filter Apply/cursor pages; preserve transport, errors and selection behavior. Test repeated Apply, out-of-order responses, scope change, page resets and unmount.
- [ ] Training: extract resume/reconciliation decisions; preserve one coordinator, session authority, accepted progress, request generations, supersession and offline/error behavior. Characterize revisions and stale responses before moving code.
- [ ] Relevant integration checks, docs and independent review; attach review-ready PRs with exact evidence.

No UI redesign, SQL/DB/API contract changes, scheduler policy or learning mutations. No merge/deploy without further owner approval. #413 diagnosis is context only, not an additional optimization target. Stop after these slices.

## First checkpoint

Root baseline opt-in benchmark on unchanged merged application source/canonical3100 fails at first accepted-action timing wait while UI advances. Evidence `/tmp/612-telemetry-baseline.log` and Playwright stalled-transition attachment. This establishes a red reproduction; no deadline or budget changes. Independent agents inspect timing identity and propose Library/Training seams; those extractions remain pending until telemetry is accepted.
