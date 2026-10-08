# 2000NL isolated worktrees

All material 2000NL work happens in a project-local worktree:

```text
/Users/khrustal/dev/2000nl/.worktrees/<issue-number>-<short-slug>
```

The directory is ignored by Git. It is intentionally inside the 2000NL
workspace so its purpose and owner are obvious, without placing checkout state
in `adhoc` or a shared directory outside the project. `main` remains the
read-only reference checkout. Release integration lands on `origin/main`; do
not implement feature work or commit unrelated changes on the reference branch.

## Create and prepare

From the canonical main 2000NL checkout, after completing the lifecycle start
checks and claiming an owning GitHub issue, run:

```bash
scripts/create-worktree.sh 123 concise-scope
```

The command first runs `scripts/sync-reference.sh`, then creates
`codex/123-concise-scope`, adds the checkout under `.worktrees`, then runs a
clean `npm ci --include=dev --prefer-offline` inside that checkout's `apps/ui`.
This installs the local `next`, `tsc`, `vitest`, and `playwright` commands from
the committed lockfile.

After a release merge, the canonical `main` checkout may be behind its
upstream. Sync it directly with:

```bash
scripts/sync-reference.sh
```

This is a fast-forward-only operation. It requires the canonical checkout to
be clean, on `main`, and tracking `origin/main`; it fetches and fast-forwards
only when local `main` is an ancestor of `origin/main`. It refuses dirty,
wrong-branch, locally-ahead, and divergent states without stashing, resetting,
or resolving local work. Preserve any local changes or commits explicitly
before retrying. `create-worktree.sh` invokes the same sync before adding its
new worktree, so a stale reference checkout cannot silently seed new work.

For work that will run browser e2e tests, request the Playwright browser too:

```bash
scripts/create-worktree.sh 123 concise-scope --e2e
```

For dictionary import, scraper, or ingestion tests, request the Python
environment too:

```bash
scripts/create-worktree.sh 123 concise-scope --ingestion
```

The flags compose when a task needs both toolchains:

```bash
scripts/create-worktree.sh 123 concise-scope --e2e --ingestion
```

The Chromium binary is installed in Playwright's normal user cache, not copied
into the checkout. This is safe to reuse across worktrees because it is tied to
the installed Playwright version, while the JavaScript dependency tree remains
local to each checkout.

To verify that browser e2e prerequisites are ready, run:

```bash
scripts/bootstrap-worktree.sh --check-e2e
```

To prepare or verify ingestion prerequisites in an existing worktree, run:

```bash
scripts/bootstrap-worktree.sh --install --ingestion
scripts/bootstrap-worktree.sh --check --ingestion
```

For a documentation-only task, use `--no-install`. Before running UI checks in
such a checkout, run:

```bash
scripts/bootstrap-worktree.sh --install
```

Use `scripts/bootstrap-worktree.sh --check` before starting a UI server or
reporting UI validation. It rejects a linked or copied `node_modules` directory,
verifies all required UI commands, and checks both the absolute checkout path
and the `package-lock.json` hash recorded after installation. A changed lockfile
therefore forces a clean install instead of silently reusing stale dependencies.

## Why dependencies stay local

Every worktree has its own `node_modules`, `.venv`, and build output. Never copy
or symlink `node_modules`, `.venv`, `.next`, `.next-dev`, `.env*`, or local Supabase state
between checkout directories: mutable caches and native packages would make a
test result belong to the wrong source tree. npm's shared content cache makes
the clean install reuse already downloaded package archives where possible.

Secrets and local runtime state are deliberately not copied. Set them up via
the existing local QA and environment runbooks only when that task needs them.

`--no-install` is an explicit opt-out, not a way to prepare a test-capable
worktree. Run the bootstrap install before using Vitest, typecheck, lint, Next,
or Playwright in that checkout. Add `--ingestion` when Python import tooling is
needed. For e2e, use `--e2e`; the older `--install-e2e` and `--check-e2e`
aliases remain supported.

## Existing worktrees and cleanup

Before moving or removing a checkout, inspect its dirty files, unique commits,
upstream, issue/PR state, and owner. Preserve dirty or unintegrated work. A
clean checkout whose commits are already reachable from `origin/main` may be
removed with `git worktree remove <path>` after recording the evidence in its
issue or handoff.

Do not create new 2000NL worktrees in `/Users/khrustal/adhoc`.

## Required lifecycle checkpoints

`main` is the clean, current reference checkout. Worktrees isolate unfinished
work; they do not replace synchronizing the reference. Do not edit product code
on reference `main` or merge abandoned work merely to retire a directory.

1. **Start:** fetch/sync the reference with `scripts/sync-reference.sh`, then
   create or deliberately resume one issue-owned worktree. Report its path,
   branch, base commit, owner and issue. Reuse an existing suitable checkout
   rather than create another for the same scope.
2. **Checkpoint:** commit a coherent, checked change on its feature branch.
   Keep unreviewed research, restricted corpora and secrets out of release PRs.
   If pausing, record remaining work and the exact branch/commit in the issue.
3. **Merge:** integrate only reviewed, validated changes through their PR.
   Separate open work remains isolated. Squash merging preserves the accepted
   change in main but does not make feature commits ancestors of main.
4. **Release:** verify deployment when applicable, then fast-forward reference
   main with `scripts/sync-reference.sh`. Verify local HEAD equals freshly
   fetched origin/main; report deployment commit separately. A dirty main is a
   preservation/coordination problem, never a reason to reset or auto-stash it.
5. **Retire:** after confirming owner/session/process inactivity, inspect dirty
   files, ignored artifacts, unique commits, upstream and PR state again.
   Preserve unpublished work and needed ignored artifacts, record recovery paths
   and evidence, then remove the checkout using `git worktree remove <path>`.
   Keep branch refs until unique commit preservation is verified. Do not use
   force removal to get past dirty work.

At the end of each completed issue and during the daily logbook checkpoint,
review worktrees for retirement. Keep checkouts only for active work, explicit
paused work, pending review, running services, or required local evidence/data.
Git commits, PRs and retained branch refs provide code history; installed
`node_modules`, build output and an idle checkout do not provide extra history.
There is no automatic merging or deletion by age, and no periodic database reset.

For squash-merged candidates, verify the merged PR head matches the saved branch
head and inspect any commits made after it. A closed-unmerged PR, an issue number,
or a clean status alone does not prove its work was integrated. Unknown ownership
and important ignored files block automatic retirement.
