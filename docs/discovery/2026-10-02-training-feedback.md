# Joint Training feedback: 2 October 2026

Owner: UI presentation and client account-read lifecycle. Scheduler, FSRS, session membership, and server authority contracts are unchanged.

## Evidence and grouped causes

1. **Periodic dimming (#519)**: two owner marks were approximately 1.08s and 0.91s after a session-snapshot refresh restored controls. Additional observations showed four controls changing opacity 1 → 0.5 → 1 during 20-second authority reads. The card remained mounted. This is an ownership fence affecting presentation, not evidence of a card reload. Detailed sanitized timings are on the issue.
2. **Start needs two clicks (#522)**: account-material focus reads disabled Start; saved-setup focus reads replaced its entire overview with loading. Both are reproduced by regression tests. Original production observations did not timestamp both clicks; a single start RPC took 7.93s. The implemented focus fix still needs owner confirmation in production. Startup latency remains separate (#440/#442).
3. **Completion UX and palette (#521)**: a real 10/10 run showed the generic exhausted-candidates message. Approved state components used semantic variables but the terminal branch lacked their theme scope. Tests distinguish completed finite plans from early exhaustion and cover both theme modes.

## Changes

- Keep disabled controls visually stable only during an ordinary background ownership read. Preserve all actual answer gates. Offline and failed authority checks remain blocked with normal disabled presentation; accepted-action busy/recovery styling takes precedence.
- Keep accepted same-account setup/material snapshots ready during focus refreshes; initial loads and failed reads remain blocked. Generation checks, account ownership and optimistic-write conflict handling remain intact.
- Show completed-card count, Start next session, Edit training (current configuration in the builder), and Back to Training. The next session is a fresh server-owned run; this does not extend consumed members or promise that a particular number of eligible cards is available. Early exhaustion offers edit and home without another-batch promise.
- Apply the account palette to the entire Training surface, including terminal states.
- Persist the owner-requested joint-browser rule in AGENTS.md: existing Chrome profile Nikolai through the extension.

## Validation and limits

Five new unit assertions fail against the original implementation (two focus paths and completed copy in three languages). The browser opacity assertion fails without the visual rule: four controls have opacity 0.5. Restoring the changes makes the targeted checks pass.

The browser suite uses the actual Training controller with deterministic RPC/lookup fixtures and the isolated local QA identity. It covers finite completion, another run, editor navigation, paused resume, one-click launch during delayed focus reads, two real authority polls, distinct accepted targets, and offline fencing. These are client regressions, not production latency measurements.

During development an initial browser run used the old presentation flags and failed to locate Start. Other idle runs were interrupted by development hot reloads while source files were edited. Final verification must run against a stable source and the approved presentation flags.

Final local verification: 141 unit/component tests and 8 browser tests passed; typecheck passed; lint passed with the existing `handlePlayAudio` dependency warning. The stable browser run crossed two real authority polls without card detachment or button dimming.

Remaining: owner confirmation after rollout, server first-card latency, and apparent repeated cards (#520). Do not infer that these independent observations are all resolved by this patch.
