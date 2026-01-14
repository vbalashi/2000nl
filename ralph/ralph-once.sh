#!/bin/bash
# Ralph Wiggum - Single iteration (interactive mode)
# Use this for human-in-the-loop development
# Usage: ./ralph-once.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BASE_CMD=""

select_base_command() {
  if [ -n "$RALPH_CMD" ]; then
    BASE_CMD="$RALPH_CMD"
  elif [ -t 0 ]; then
    read -r -p "Base command to run [claude]: " BASE_CMD
  fi

  BASE_CMD="${BASE_CMD:-claude}"

  if ! command -v "$BASE_CMD" >/dev/null 2>&1; then
    echo "Error: command '$BASE_CMD' not found in PATH."
    echo "Set RALPH_CMD or install the command and try again."
    exit 1
  fi
}

cd "$PROJECT_DIR"

echo "═══════════════════════════════════════════════════════"
echo "  Ralph - Single Interactive Iteration"
echo "═══════════════════════════════════════════════════════"
echo ""
select_base_command
echo "Using base command: $BASE_CMD"

# Run claude interactively with the ralph prompt
"$BASE_CMD" --dangerously-skip-permissions "$(cat "$SCRIPT_DIR/prompt.md")"
