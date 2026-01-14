#!/bin/bash
# Arch Migration Agent Loop
# Usage: ./ralph.sh [max_iterations]

set -e

MAX_ITERATIONS=${1:-10}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
PRJ_FILE="$SCRIPT_DIR/prj.json"
PRD_FILE="$SCRIPT_DIR/prd.json"
PROGRESS_FILE="$SCRIPT_DIR/progress.txt"
ARCHIVE_DIR="$SCRIPT_DIR/archive"
BASE_CMD=""
LAST_MESSAGE_FILE="$ARCHIVE_DIR/last-message.txt"

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

# Initialize progress file if it doesn't exist
if [ ! -f "$PROGRESS_FILE" ]; then
  echo "# Arch Migration Progress Log" > "$PROGRESS_FILE"
  echo "Started: $(date)" >> "$PROGRESS_FILE"
  echo "---" >> "$PROGRESS_FILE"
fi

mkdir -p "$ARCHIVE_DIR"

echo "Starting Arch Migration Agent - Max iterations: $MAX_ITERATIONS"
echo "Project directory: $PROJECT_DIR"
select_base_command
echo "Using base command: $BASE_CMD"

cd "$PROJECT_DIR"

for i in $(seq 1 $MAX_ITERATIONS); do
  echo ""
  echo "═══════════════════════════════════════════════════════"
  echo "  Arch Migration Iteration $i of $MAX_ITERATIONS"
  echo "═══════════════════════════════════════════════════════"

  previous_passes=""
  if [ -f "$PRD_FILE" ]; then
    previous_passes=$(jq -r '.userStories[]? | select(.passes == true) | .id' "$PRD_FILE" 2>/dev/null | sort -u)
  fi

  : > "$LAST_MESSAGE_FILE"
  OUTPUT=$("$BASE_CMD" exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check -o "$LAST_MESSAGE_FILE" "$(cat "$SCRIPT_DIR/prompt.md")" 2>&1 | tee /dev/stderr) || true

  # Update app-behavior.md with completed feature
  if [ -f "$PRD_FILE" ]; then
    current_passes=$(jq -r '.userStories[]? | select(.passes == true) | .id' "$PRD_FILE" 2>/dev/null | sort -u)
    new_passes=$(comm -13 <(printf '%s\n' "$previous_passes") <(printf '%s\n' "$current_passes") | sed '/^$/d')
    if [ -n "$new_passes" ]; then
      while IFS= read -r story_id; do
        [ -z "$story_id" ] && continue
        echo "Updating docs/app-behavior.md..."
        "$BASE_CMD" exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check "Read ralph/prd.json story $story_id and docs/app-behavior.md. Add a brief feature entry (2-4 sentences) documenting what changed." || true
      done <<< "$new_passes"
    fi
  fi

  if grep -q "<promise>COMPLETE</promise>" "$LAST_MESSAGE_FILE"; then
    echo ""
    echo "All tasks completed."
    exit 0
  fi

  echo "Iteration $i complete. Continuing..."
  sleep 2
done

echo ""
echo "Reached max iterations ($MAX_ITERATIONS) without completing all tasks."
echo "Check $PROGRESS_FILE for status."
exit 1
