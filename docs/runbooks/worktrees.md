# 2000NL isolated worktrees

All material 2000NL work happens in a project-local worktree:

```text
/Users/khrustal/dev/2000nl/.worktrees/<issue-number>-<short-slug>
```

The directory is ignored by Git. It is intentionally inside the 2000NL
workspace so its purpose and owner are obvious, without placing checkout state
in `adhoc` or a shared directory outside the project. `main` remains the
read-only reference checkout.

## Create and prepare

From the main 2000NL checkout, after completing the lifecycle start checks and
claiming an owning GitHub issue, run:

```bash
scripts/create-worktree.sh 123 concise-scope
```

The command fetches `origin/main`, creates
`codex/123-concise-scope`, adds the checkout under `.worktrees`, then runs a
clean `npm ci --include=dev --prefer-offline` inside that checkout's `apps/ui`.
This installs the local `next`, `tsc`, `vitest`, and `playwright` commands from
the committed lockfile.

For work that will run browser e2e tests, request the Playwright browser too:

```bash
scripts/create-worktree.sh 123 concise-scope --e2e
```

The Chromium binary is installed in Playwright's normal user cache, not copied
into the checkout. This is safe to reuse across worktrees because it is tied to
the installed Playwright version, while the JavaScript dependency tree remains
local to each checkout.

To verify that browser e2e prerequisites are ready, run:

```bash
scripts/bootstrap-worktree.sh --check-e2e
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

Every worktree has its own `node_modules` and build output. Never copy or
symlink `node_modules`, `.next`, `.next-dev`, `.env*`, or local Supabase state
between checkout directories: mutable caches and native packages would make a
test result belong to the wrong source tree. npm's shared content cache makes
the clean install reuse already downloaded package archives where possible.

Secrets and local runtime state are deliberately not copied. Set them up via
the existing local QA and environment runbooks only when that task needs them.

`--no-install` is an explicit opt-out, not a way to prepare a test-capable
worktree. Run the bootstrap install before using Vitest, typecheck, lint, Next,
or Playwright in that checkout. For e2e, use `--install-e2e` and verify with
`--check-e2e`.

## Existing worktrees and cleanup

Before moving or removing a checkout, inspect its dirty files, unique commits,
upstream, issue/PR state, and owner. Preserve dirty or unintegrated work. A
clean checkout whose commits are already reachable from `origin/main` may be
removed with `git worktree remove <path>` after recording the evidence in its
issue or handoff.

Do not create new 2000NL worktrees in `/Users/khrustal/adhoc`.
