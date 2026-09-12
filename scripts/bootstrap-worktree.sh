#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/bootstrap-worktree.sh --install|--check [--e2e] [--ingestion]
       scripts/bootstrap-worktree.sh --install-e2e|--check-e2e

Install or verify dependencies for this exact 2000NL worktree. Dependencies
stay local to the checkout. Never link or copy node_modules or .venv from
another checkout.

Modes:
  --install       Install the UI toolchain with npm ci.
  --check         Verify the exact checkout, lockfile, and required UI tools.
  --e2e           Also install/check Playwright Chromium.
  --ingestion     Also install/check the Python ingestion environment.

Compatibility aliases:
  --install-e2e   Same as --install --e2e.
  --check-e2e     Same as --check --e2e.
EOF
}

if [[ $# -eq 1 && ( "$1" == "--help" || "$1" == "-h" ) ]]; then
  usage
  exit 0
fi

if [[ $# -lt 1 ]]; then
  usage >&2
  exit 64
fi

action=""
want_e2e=false
want_ingestion=false

for option in "$@"; do
  case "$option" in
    --install)
      [[ -z "$action" ]] || { usage >&2; exit 64; }
      action="install"
      ;;
    --check)
      [[ -z "$action" ]] || { usage >&2; exit 64; }
      action="check"
      ;;
    --e2e)
      want_e2e=true
      ;;
    --ingestion)
      want_ingestion=true
      ;;
    --install-e2e)
      [[ $# -eq 1 && -z "$action" ]] || { usage >&2; exit 64; }
      action="install"
      want_e2e=true
      ;;
    --check-e2e)
      [[ $# -eq 1 && -z "$action" ]] || { usage >&2; exit 64; }
      action="check"
      want_e2e=true
      ;;
    *)
      usage >&2
      exit 64
      ;;
  esac
done

if [[ -z "$action" ]]; then
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
requirements="$repo_root/packages/ingestion/requirements.txt"
venv_dir="$repo_root/.venv"
venv_python="$venv_dir/bin/python"
ingestion_marker="$venv_dir/.2000nl-worktree-ingestion"

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
if [[ "$want_ingestion" == true && ! -f "$requirements" ]]; then
  printf 'Missing ingestion requirements: %s\n' "$requirements" >&2
  exit 1
fi

lock_hash="$(git hash-object "$lockfile")"
expected_marker="$(printf 'root=%s\nlockfile=%s' "$repo_root" "$lock_hash")"
# Keep a separate marker so base dependency readiness and browser readiness can
# be invalidated independently when the Playwright cache changes.
expected_e2e_marker="$expected_marker"
if [[ "$want_ingestion" == true ]]; then
  requirements_hash="$(git hash-object "$requirements")"
  expected_ingestion_marker="$(printf 'root=%s\nrequirements=%s' "$repo_root" "$requirements_hash")"
fi

install_hint=(--install)
[[ "$want_e2e" == true ]] && install_hint+=(--e2e)
[[ "$want_ingestion" == true ]] && install_hint+=(--ingestion)

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
      "$repo_root" "${missing[*]}" "${install_hint[*]}" >&2
    return 1
  fi

  for binary in "${required_bins[@]}"; do
    if ! "$modules_dir/.bin/$binary" --version >/dev/null 2>&1; then
      printf 'UI toolchain command is not runnable for %s: %s. Run scripts/bootstrap-worktree.sh %s.\n' \
        "$repo_root" "$binary" "${install_hint[*]}" >&2
      return 1
    fi
  done

  (
    cd "$ui_dir"
    npm ls --depth=0 >/dev/null
  )
}

check_ingestion_toolchain() {
  if [[ -L "$venv_dir" ]]; then
    printf 'Refusing shared Python environment symlink: %s\n' "$venv_dir" >&2
    return 1
  fi
  if [[ ! -x "$venv_python" ]]; then
    printf 'Python ingestion environment is missing for %s. Run scripts/bootstrap-worktree.sh %s.\n' \
      "$repo_root" "${install_hint[*]}" >&2
    return 1
  fi
  if [[ ! -f "$ingestion_marker" || "$(<"$ingestion_marker")" != "$expected_ingestion_marker" ]]; then
    printf 'Python ingestion dependencies are not current for this worktree or requirements file. Run scripts/bootstrap-worktree.sh %s.\n' \
      "${install_hint[*]}" >&2
    return 1
  fi
  "$venv_python" -m pip check >/dev/null
  "$venv_python" -c 'import bs4, dotenv, jsonschema, psycopg2, pytest' >/dev/null
}

check_playwright_browser_installation() {
  (
    cd "$ui_dir"
    # The dollar expression below belongs to JavaScript.
    # shellcheck disable=SC2016
    node -e '
      const fs = require("node:fs");
      const { registry } = require("playwright-core/lib/server/registry/index");
      for (const name of ["chromium", "chromium-headless-shell"]) {
        const executable = registry.findExecutable(name)?.executablePath();
        if (!executable) throw new Error(`Playwright executable is unresolved: ${name}`);
        fs.accessSync(executable, fs.constants.X_OK);
      }
    '
  )
}

if [[ "$action" == "check" ]]; then
  if [[ -L "$modules_dir" ]]; then
    printf 'Refusing shared node_modules symlink: %s\n' "$modules_dir" >&2
    exit 1
  fi

  if [[ ! -f "$install_marker" || "$(<"$install_marker")" != "$expected_marker" ]]; then
    printf 'UI dependencies are not current for this worktree or lockfile. Run scripts/bootstrap-worktree.sh %s.\n' "${install_hint[*]}" >&2
    exit 1
  fi

  check_ui_toolchain
  if [[ "$want_e2e" == true ]]; then
    if [[ ! -f "$e2e_marker" || "$(<"$e2e_marker")" != "$expected_e2e_marker" ]]; then
      printf 'Playwright Chromium is not installed for this worktree or lockfile. Run scripts/bootstrap-worktree.sh --install-e2e.\n' >&2
      exit 1
    fi
    check_playwright_browser_installation
  fi
  if [[ "$want_ingestion" == true ]]; then
    check_ingestion_toolchain
  fi
  printf 'Requested worktree dependencies are ready for %s\n' "$repo_root"
  exit 0
fi

(
  cd "$ui_dir"
  npm ci --include=dev --prefer-offline
  if [[ "$want_e2e" == true ]]; then
    if ! check_playwright_browser_installation; then
      "$modules_dir/.bin/playwright" install chromium
    fi
    check_playwright_browser_installation
  fi
)

printf '%s\n' "$expected_marker" > "$install_marker"
if [[ "$want_e2e" == true ]]; then
  printf '%s\n' "$expected_e2e_marker" > "$e2e_marker"
fi

if [[ "$want_ingestion" == true ]]; then
  if [[ -L "$venv_dir" ]]; then
    printf 'Refusing shared Python environment symlink: %s\n' "$venv_dir" >&2
    exit 1
  fi
  python_bin="${PYTHON:-python3}"
  if ! command -v "$python_bin" >/dev/null 2>&1; then
    printf 'Missing Python interpreter: %s\n' "$python_bin" >&2
    exit 1
  fi
  if [[ ! -x "$venv_python" ]]; then
    "$python_bin" -m venv "$venv_dir"
  fi
  "$venv_python" -m pip install -r "$requirements"
  printf '%s\n' "$expected_ingestion_marker" > "$ingestion_marker"
fi

check_args=(--check)
[[ "$want_e2e" == true ]] && check_args+=(--e2e)
[[ "$want_ingestion" == true ]] && check_args+=(--ingestion)
exec "$repo_root/scripts/bootstrap-worktree.sh" "${check_args[@]}"
