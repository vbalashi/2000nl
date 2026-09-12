#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/bootstrap-worktree.sh --install | --install-e2e | --check | --check-e2e

Install or verify the UI dependencies for this exact 2000NL worktree.
Dependencies are installed locally from the committed package lock. Never link
or copy node_modules from another checkout.

Modes:
  --install       Install the UI toolchain with npm ci.
  --install-e2e   Install the UI toolchain and Playwright Chromium.
  --check         Verify the exact checkout, lockfile, and required UI tools.
  --check-e2e     Verify the UI toolchain and launch Playwright Chromium.
EOF
}

if [[ $# -eq 1 && ( "$1" == "--help" || "$1" == "-h" ) ]]; then
  usage
  exit 0
fi

if [[ $# -ne 1 ]]; then
  usage >&2
  exit 64
fi

mode="$1"
if [[ "$mode" != "--install" && "$mode" != "--install-e2e" && "$mode" != "--check" && "$mode" != "--check-e2e" ]]; then
  usage >&2
  exit 64
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(git -C "$script_dir/.." rev-parse --show-toplevel)"
common_git_dir="$(git -C "$script_dir/.." rev-parse --path-format=absolute --git-common-dir)"
project_root="$(dirname "$common_git_dir")"
ui_dir="$repo_root/apps/ui"
lockfile="$ui_dir/package-lock.json"
modules_dir="$ui_dir/node_modules"
install_marker="$modules_dir/.2000nl-worktree-root"
e2e_marker="$modules_dir/.2000nl-playwright-chromium"
required_bins=(next tsc vitest playwright)

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

lock_hash="$(git hash-object "$lockfile")"
expected_marker="$(printf 'root=%s\nlockfile=%s' "$repo_root" "$lock_hash")"
# Keep a separate marker so base dependency readiness and browser readiness can
# be invalidated independently when the Playwright cache changes.
expected_e2e_marker="$expected_marker"

install_hint="--install"
if [[ "$mode" == "--check-e2e" ]]; then
  install_hint="--install-e2e"
fi

check_ui_toolchain() {
  local missing=()
  local binary

  for binary in "${required_bins[@]}"; do
    if [[ ! -x "$modules_dir/.bin/$binary" ]]; then
      missing+=("$binary")
    fi
  done

  if [[ "${#missing[@]}" -gt 0 ]]; then
    printf 'UI toolchain is incomplete for %s (missing: %s). Run scripts/bootstrap-worktree.sh %s.\n' \
      "$repo_root" "${missing[*]}" "$install_hint" >&2
    return 1
  fi

  for binary in "${required_bins[@]}"; do
    if ! "$modules_dir/.bin/$binary" --version >/dev/null 2>&1; then
      printf 'UI toolchain command is not runnable for %s: %s. Run scripts/bootstrap-worktree.sh %s.\n' \
        "$repo_root" "$binary" "$install_hint" >&2
      return 1
    fi
  done

  (
    cd "$ui_dir"
    npm ls --depth=0 >/dev/null
  )
}

check_playwright_browser() {
  (
    cd "$ui_dir"
    node -e 'const { chromium } = require("playwright"); (async () => { const browser = await chromium.launch({ headless: true }); await browser.close(); })().catch((error) => { console.error(error.message); process.exit(1); });'
  )
}

if [[ "$mode" == "--check" || "$mode" == "--check-e2e" ]]; then
  if [[ -L "$modules_dir" ]]; then
    printf 'Refusing shared node_modules symlink: %s\n' "$modules_dir" >&2
    exit 1
  fi

  if [[ ! -f "$install_marker" || "$(<"$install_marker")" != "$expected_marker" ]]; then
    printf 'UI dependencies are not current for this worktree or lockfile. Run scripts/bootstrap-worktree.sh %s.\n' "$install_hint" >&2
    exit 1
  fi

  check_ui_toolchain
  if [[ "$mode" == "--check-e2e" ]]; then
    if [[ ! -f "$e2e_marker" || "$(<"$e2e_marker")" != "$expected_e2e_marker" ]]; then
      printf 'Playwright Chromium is not installed for this worktree or lockfile. Run scripts/bootstrap-worktree.sh --install-e2e.\n' >&2
      exit 1
    fi
    check_playwright_browser
  fi
  printf 'UI dependencies are ready for %s\n' "$repo_root"
  exit 0
fi

(
  cd "$ui_dir"
  npm ci --include=dev --prefer-offline
  if [[ "$mode" == "--install-e2e" ]]; then
    "$modules_dir/.bin/playwright" install chromium
    check_playwright_browser
  fi
)

printf '%s\n' "$expected_marker" > "$install_marker"
if [[ "$mode" == "--install-e2e" ]]; then
  printf '%s\n' "$expected_e2e_marker" > "$e2e_marker"
fi

if [[ "$mode" == "--install-e2e" ]]; then
  exec "$repo_root/scripts/bootstrap-worktree.sh" --check-e2e
fi
exec "$repo_root/scripts/bootstrap-worktree.sh" --check
