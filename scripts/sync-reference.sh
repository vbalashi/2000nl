#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf 'Cannot sync reference checkout: %s\n' "$1" >&2
  exit 1
}

common_git_dir="$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" ||
  fail 'run this command inside the 2000NL Git repository.'
repo_root="$(dirname "$common_git_dir")"
current_root="$(git rev-parse --show-toplevel)"

if [[ "$current_root" != "$repo_root" ]]; then
  fail "run this command from the canonical reference checkout at $repo_root, not a worktree."
fi

branch="$(git branch --show-current)"
if [[ "$branch" != "main" ]]; then
  fail "the canonical checkout must be on main (currently ${branch:-detached})."
fi

upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || true)"
if [[ "$upstream" != "origin/main" ]]; then
  fail "main must track origin/main (currently ${upstream:-no upstream})."
fi

if [[ -n "$(git status --porcelain --untracked-files=all)" ]]; then
  fail 'the reference checkout has local changes; preserve them separately before syncing.'
fi

git fetch --quiet origin main
remote_commit="$(git rev-parse FETCH_HEAD)"
local_commit="$(git rev-parse HEAD)"

if [[ "$local_commit" == "$remote_commit" ]]; then
  printf 'Reference main is current at %s.\n' "${local_commit:0:12}"
  exit 0
fi

if ! git merge-base --is-ancestor "$local_commit" "$remote_commit"; then
  fail 'local main is ahead of or diverged from origin/main; reconcile it explicitly.'
fi

git merge --ff-only --quiet "$remote_commit"
printf 'Fast-forwarded reference main to %s.\n' "${remote_commit:0:12}"
