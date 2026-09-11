#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/create-worktree.sh <issue-number> <short-slug> [--no-install]

Creates a 2000NL checkout at .worktrees/<issue-number>-<short-slug> from the
current origin/main, creates branch codex/<issue-number>-<short-slug>, and by
default installs the UI dependencies for that checkout.
EOF
}

if [[ $# -lt 2 || $# -gt 3 ]]; then
  usage >&2
  exit 64
fi

issue="$1"
slug="$2"
install_dependencies=true

if [[ $# -eq 3 ]]; then
  if [[ "$3" != "--no-install" ]]; then
    usage >&2
    exit 64
  fi
  install_dependencies=false
fi

if [[ ! "$issue" =~ ^[1-9][0-9]*$ ]]; then
  printf 'Issue number must be a positive integer.\n' >&2
  exit 64
fi

if [[ ! "$slug" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
  printf 'Short slug must use lowercase letters, numbers, and single hyphens.\n' >&2
  exit 64
fi

common_git_dir="$(git rev-parse --path-format=absolute --git-common-dir)"
repo_root="$(dirname "$common_git_dir")"
current_root="$(git rev-parse --show-toplevel)"

if [[ "$current_root" != "$repo_root" ]]; then
  printf 'Create worktrees from the 2000NL reference checkout: %s\n' "$repo_root" >&2
  exit 1
fi

name="$issue-$slug"
target="$repo_root/.worktrees/$name"
branch="codex/$name"

if [[ -e "$target" ]]; then
  printf 'Worktree target already exists: %s\n' "$target" >&2
  exit 1
fi

if git show-ref --verify --quiet "refs/heads/$branch"; then
  printf 'Branch already exists: %s\n' "$branch" >&2
  exit 1
fi

created=false

cleanup_failed_creation() {
  exit_code=$?
  if [[ "$created" == true ]]; then
    printf 'Removing incomplete worktree: %s\n' "$target" >&2
    git worktree remove --force "$target" || true
    git branch -D "$branch" || true
  fi
  exit "$exit_code"
}

trap cleanup_failed_creation ERR

git fetch origin main
git worktree add -b "$branch" "$target" origin/main
created=true

if [[ "$install_dependencies" == true ]]; then
  "$target/scripts/bootstrap-worktree.sh" --install
fi

trap - ERR
printf 'Created %s\n' "$target"
