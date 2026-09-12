#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/create-worktree.sh <issue-number> <short-slug> [--no-install] [--e2e] [--ingestion]

Creates a 2000NL checkout at .worktrees/<issue-number>-<short-slug> from the
current origin/main, creates branch codex/<issue-number>-<short-slug>, and by
default installs the UI toolchain for that checkout.

Options:
  --no-install   Skip dependency installation for documentation-only work.
  --e2e          Also install the Playwright Chromium browser.
  --ingestion    Also install the Python dictionary ingestion environment.
EOF
}

if [[ $# -eq 1 && ( "$1" == "--help" || "$1" == "-h" ) ]]; then
  usage
  exit 0
fi

if [[ $# -lt 2 ]]; then
  usage >&2
  exit 64
fi

issue="$1"
slug="$2"
skip_install=false
want_e2e=false
want_ingestion=false

shift 2
for option in "$@"; do
  case "$option" in
    --no-install) skip_install=true ;;
    --e2e) want_e2e=true ;;
    --ingestion) want_ingestion=true ;;
    *) usage >&2; exit 64 ;;
  esac
done

if [[ "$skip_install" == true && ( "$want_e2e" == true || "$want_ingestion" == true ) ]]; then
  printf '%s\n' '--no-install cannot be combined with --e2e or --ingestion.' >&2
  exit 64
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
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script_root="$(git -C "$script_dir/.." rev-parse --show-toplevel)"

if [[ "$current_root" != "$repo_root" || "$script_root" != "$repo_root" ]]; then
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

if [[ "$skip_install" == false ]]; then
  bootstrap_args=(--install)
  [[ "$want_e2e" == true ]] && bootstrap_args+=(--e2e)
  [[ "$want_ingestion" == true ]] && bootstrap_args+=(--ingestion)
  "$target/scripts/bootstrap-worktree.sh" "${bootstrap_args[@]}"
fi

trap - ERR
printf 'Created %s\n' "$target"
