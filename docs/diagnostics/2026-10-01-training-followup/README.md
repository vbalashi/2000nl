# Additional evidence, 2026-10-01

Production 0.18.1063 / DB194 / both presentations enabled. Existing post-deploy code was measured; runtime behavior was not edited. Three isolated QA browser runs, 75 total action attempts, two 409 failures; session wrapper revoked all sessions. Raw JSONL records timing, status, visible controls and hashed state correlation; no credentials or human account data.

Reports:
- `../../discovery/2026-10-01-training-state-conflict.md`
- `../../discovery/2026-10-01-completed-session-continue.md`
- `../../discovery/2026-10-01-training-server-latency.md`
- `../../discovery/2026-10-01-presentation-retirement.md`

`raw/conflict-capture-*`: 13 attempts; initial error parser missed the string enum.
`raw/conflict-confirm-*`: 30 successful attempts, completed-home controls/screenshots.
`raw/conflict-state-*`: 32 attempts; exact `state_conflict`, accepted previous revision for the same hashed entry. This final harness is in `harness/conflict-boundary.mjs`; retain the earlier parser limitation when comparing captures.

Reproduction uses `scripts/latency-audit/run.sh` and the allowlisted QA configuration, never manual credentials. Run sequentially. The script alters only the isolated QA learning state. Dwell 100/500 ms, mixed Learn/Again/Hard/Good/Easy, up to 40 attempts; stops on failed mutation. Successful completion is observation, not proof that intermittent conflict is gone.

SQL probes use QA only, read-only transactions, external read-only/8-second statement timeout/1-second lock timeout. Plan SQL includes later probes that were NOT reached after the first timed out; its result file explicitly records failure. `pgss-delta.json` is computed by query ID and role and is database-wide, not isolated request attribution. No counter reset, production schema change or scheduler write was performed by SQL probes.

Open questions: exact cache invalidation race, recovery after rejected action, query plan/wait-event evidence for slow starts and simultaneous server delays. No infrastructure sizing conclusion is warranted yet.
