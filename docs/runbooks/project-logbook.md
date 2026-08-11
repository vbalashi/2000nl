# Project logbook

The human-facing project logbook is maintained at:

`/Users/khrustal/adhoc/2000nl-project-log.html`

It is a readable daily summary of the 2000NL / AudioFilms program. It is not a
replacement for GitHub issues, execution plans, Pen, ADRs, or the Git history.
Those remain the durable sources of truth for task state, implementation plans,
visual decisions, architecture, and exact code changes.

## Daily update rule

At the end of each active workday, or after a material agent checkpoint, update
the logbook:

1. Add the newest day at the top of the timeline.
2. Record what changed, what was verified, what is still open, and the next
   concrete action.
3. Include exact issue/PR links and commit SHAs for implementation work.
4. Mark each item `done`, `progress`, `todo`, or `blocked`.
5. Link to durable artifacts instead of copying long plans or chat history.
6. Record failed checks, regressions, and unresolved owner decisions; do not
   present a review-ready checkpoint as Done.
7. Never copy secrets, credentials, tokens, private personal data, or raw
   agent logs into the HTML.

## Agent and worktree review

The daily update should inspect recent agent/session checkpoints and the active
2000NL worktrees. At minimum, verify:

- active branches, dirty/unpushed work, and exact PR heads;
- new review-ready, blocked, or owner-review checkpoints;
- CI/test/build results relevant to the current slice;
- whether an agent left a worktree or execution plan unfinished;
- whether the next action belongs to the owner, an agent, or GitHub/Pen.

If there is no material change, update the `last checked` note only when the
scheduled review needs an audit trail; do not create noisy duplicate entries.

## Ownership

- The user owns product approval and visual review.
- GitHub owns issue/PR lifecycle and priority.
- Repository docs own contracts, runbooks, and durable decisions.
- The logbook owns the human-readable daily overview.
- The scheduled Codex task may propose and apply log-only updates after
  checking evidence, but must not merge PRs, close issues, or silently change
  product code.
