#!/bin/bash
# Arch Migration Agent - Single iteration (interactive mode)
# Usage: ./ralph-once.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
BASE_CMD=""

select_base_command() {
  if [ -n "$RALPH_CMD" ]; then
    BASE_CMD="$RALPH_CMD"
  elif [ -t 0 ]; then
    read -r -p "Base command to run [codex]: " BASE_CMD
  fi

  BASE_CMD="${BASE_CMD:-codex}"

  if ! command -v "$BASE_CMD" >/dev/null 2>&1; then
    echo "Error: command '$BASE_CMD' not found in PATH."
    echo "Set RALPH_CMD or install the command and try again."
    exit 1
  fi
}

cd "$PROJECT_DIR"

echo "═══════════════════════════════════════════════════════"
echo "  Arch Migration - Single Interactive Iteration"
echo "═══════════════════════════════════════════════════════"
echo ""
select_base_command
echo "Using base command: $BASE_CMD"

"$BASE_CMD" --dangerously-bypass-approvals-and-sandbox "$(cat "$SCRIPT_DIR/prompt.md")"
