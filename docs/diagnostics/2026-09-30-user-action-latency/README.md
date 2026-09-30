# 2026-09-30 user-action latency evidence

Production commit `c6231f28`, DB contract 178, QA account, desktop headless
Chromium from NL plus iPhone 13 emulation (+100 ms RTT, 4x CPU). Collected with
[scripts/latency-audit/](../../../scripts/latency-audit/) following
[production-latency-measurement.md](../../runbooks/production-latency-measurement.md).
Findings and decisions:
[2026-09-30-user-action-latency-audit.md](../../discovery/2026-09-30-user-action-latency-audit.md).

| File | Content |
| --- | --- |
| `analysis-desktop.txt` | `analyze.mjs` output for 60 desktop answers (54 transitions, 6 session ends) |
| `analysis-mobile-4g.txt` | Same for 24 mobile-emulated answers |
| `pgss-diff-desktop-run.txt` | Exact SQL time of the desktop run (`pg_stat_statements` before/after) |
| `pgss-historical-since-2026-05-16.txt` | Per-RPC historical means/maxima (stats reset 2026-05-16) |
| `raw/desktop-60-answers.jsonl`, `raw/mobile-4g-24-answers.jsonl` | One record per answer/session start: timing events, masked request paths, `Server-Timing`, request ids |
| `raw/library-search-typing.json` | Requests fired while typing `huis` |
| `raw/library-collection-toggles.json` | Requests and time per collection toggle |
| `raw/home-load-requests.json` | Requests during home page load |
| `screenshots/after-session-continue-disabled.png` | Today after a finished session: disabled "Continue session" |
| `screenshots/library-collections-picker.png` | Collections dialog used for the toggle measurement |

Direct SQL timings, container probes and DB configuration are summarized in
§0.1 of the audit (they were printed, not stored).
