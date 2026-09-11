#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/bootstrap-worktree.sh --install | --check

Install or verify the UI dependencies for this exact 2000NL worktree.
Dependencies are installed locally from the committed package lock. Never link
or copy node_modules from another checkout.
EOF
}

if [[ $# -ne 1 ]]; then
  usage >&2
  exit 64
fi

mode="$1"
if [[ "$mode" != "--install" && "$mode" != "--check" ]]; then
  usage >&2
  exit 64
fi

repo_root="$(git rev-parse --show-toplevel)"
common_git_dir="$(git rev-parse --path-format=absolute --git-common-dir)"
project_root="$(dirname "$common_git_dir")"
ui_dir="$repo_root/apps/ui"
lockfile="$ui_dir/package-lock.json"
modules_dir="$ui_dir/node_modules"
install_marker="$modules_dir/.2000nl-worktree-root"

case "$repo_root" in
  "$project_root"/.worktrees/*) ;;
  *)
    printf 'Run this only from a project-local isolated worktree under %s/.worktrees/.\n' "$project_root" >&2
    exit 1
    ;;
esac

if [[ ! -f "$lockfile" ]]; then
  printf 'Missing UI lockfile: %s\n' "$lockfile" >&2
  exit 1
fi

if [[ "$mode" == "--check" ]]; then
  if [[ -L "$modules_dir" ]]; then
    printf 'Refusing shared node_modules symlink: %s\n' "$modules_dir" >&2
    exit 1
  fi

  if [[ ! -x "$modules_dir/.bin/next" ]]; then
    printf 'UI dependencies are not installed for this worktree. Run scripts/bootstrap-worktree.sh --install.\n' >&2
    exit 1
  fi

  if [[ ! -f "$install_marker" || "$(<"$install_marker")" != "$repo_root" ]]; then
    printf 'UI dependencies were not installed for this exact worktree. Run scripts/bootstrap-worktree.sh --install.\n' >&2
    exit 1
  fi

  (
    cd "$ui_dir"
    npm ls --depth=0 >/dev/null
  )
  printf 'UI dependencies are ready for %s\n' "$repo_root"
  exit 0
fi

(
  cd "$ui_dir"
  npm ci --prefer-offline
)

printf '%s\n' "$repo_root" > "$install_marker"

exec "$repo_root/scripts/bootstrap-worktree.sh" --check
