#!/usr/bin/env bash
set -euo pipefail

include_3100=0
include_chrome_mcp=1
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
ui_root="$repo_root/apps/ui"

usage() {
  cat <<'EOF'
Usage: scripts/ui-local-qa-cleanup.sh [--include-3100] [--no-chrome-mcp]

Clean up local UI QA processes left by automation.

Default behavior:
  - stop 2000nl Next dev listeners on temporary ports 3101-3110
  - stop chrome-devtools-mcp processes and their automation Chrome profile
  - keep canonical port 3100 running

Options:
  --include-3100   Also stop the canonical 3100 UI server.
  --no-chrome-mcp  Do not stop chrome-devtools-mcp processes.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --include-3100)
      include_3100=1
      shift
      ;;
    --no-chrome-mcp)
      include_chrome_mcp=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

kill_port_tree() {
  local port="$1"
  local pids pid cmd candidates candidate parent

  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  [[ -n "$pids" ]] || return 0

  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    if [[ "$cmd" == *"$ui_root"* || "$cmd" == *"next-server"* ]]; then
      candidates="$pid"
      parent="$(ps -p "$pid" -o ppid= 2>/dev/null | tr -d ' ' || true)"
      while [[ -n "$parent" && "$parent" != "1" ]]; do
        cmd="$(ps -p "$parent" -o command= 2>/dev/null || true)"
        if [[ "$cmd" == *"$ui_root"* || "$cmd" == *"npm run dev"* || "$cmd" == *"next dev"* ]]; then
          candidates="$candidates $parent"
          parent="$(ps -p "$parent" -o ppid= 2>/dev/null | tr -d ' ' || true)"
        else
          break
        fi
      done

      echo "Stopping 2000nl UI process tree on port $port (pids:$candidates)"
      for candidate in $candidates; do
        pkill -TERM -P "$candidate" 2>/dev/null || true
      done
      for candidate in $candidates; do
        kill -TERM "$candidate" 2>/dev/null || true
      done
    else
      echo "Leaving non-2000nl listener on port $port (pid $pid): $cmd"
    fi
  done <<< "$pids"
}

kill_wedged_port_processes() {
  local port="$1"
  local pids pid cmd children child

  pids="$(pgrep -f "npm run dev --port $port|next dev .*--port $port" || true)"
  [[ -n "$pids" ]] || return 0

  while IFS= read -r pid; do
    [[ -n "$pid" ]] || continue
    cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    if [[ "$cmd" == *"$ui_root"* || "$cmd" == *"npm run dev --port $port"* || "$cmd" == *"next dev"* ]]; then
      echo "Stopping wedged 2000nl UI dev process for port $port (pid $pid)"
      children="$(pgrep -P "$pid" || true)"
      while IFS= read -r child; do
        [[ -n "$child" ]] || continue
        pkill -TERM -P "$child" 2>/dev/null || true
        kill -TERM "$child" 2>/dev/null || true
      done <<< "$children"
      pkill -TERM -P "$pid" 2>/dev/null || true
      kill -TERM "$pid" 2>/dev/null || true
    fi
  done <<< "$pids"
}

if [[ "$include_3100" == "1" ]]; then
  kill_port_tree 3100
  kill_wedged_port_processes 3100
fi

for port in 3101 3102 3103 3104 3105 3106 3107 3108 3109 3110; do
  kill_port_tree "$port"
  kill_wedged_port_processes "$port"
done

if [[ "$include_chrome_mcp" == "1" ]]; then
  if pgrep -f 'chrome-devtools-mcp|chrome-profile' >/dev/null 2>&1; then
    echo "Stopping chrome-devtools-mcp automation processes"
    pkill -TERM -f 'chrome-devtools-mcp|chrome-profile' 2>/dev/null || true
  fi
fi
