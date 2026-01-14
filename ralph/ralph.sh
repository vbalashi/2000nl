#!/bin/bash
# Ralph Wiggum - Long-running AI agent loop (Claude Code version)
# Adapted from https://github.com/snarktank/ralph
# Usage: ./ralph.sh [max_iterations]

set -e

MAX_ITERATIONS=${1:-10}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PRD_FILE="$SCRIPT_DIR/prd.json"
PROGRESS_FILE="$SCRIPT_DIR/progress.txt"
ARCHIVE_DIR="$SCRIPT_DIR/archive"
LAST_BRANCH_FILE="$SCRIPT_DIR/.last-branch"
DEV_BROWSER_DIR="/home/khrustal/dev/github/dev-browser/skills/dev-browser"
DEV_BROWSER_PID=""
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

# Start dev-browser server
start_dev_browser() {
  if [ -d "$DEV_BROWSER_DIR" ]; then
    echo "Starting dev-browser server..."
    cd "$DEV_BROWSER_DIR"
    # Check if already running on port 9222
    if ! lsof -i :9222 >/dev/null 2>&1; then
      ./server.sh &
      DEV_BROWSER_PID=$!
      echo "Dev-browser started (PID: $DEV_BROWSER_PID)"
      # Wait for server to be ready
      echo -n "Waiting for dev-browser to be ready"
      for i in {1..30}; do
        if curl -s http://localhost:9222 >/dev/null 2>&1; then
          echo " Ready!"
          break
        fi
        echo -n "."
        sleep 1
      done
    else
      echo "Dev-browser already running on port 9222"
    fi
    cd "$PROJECT_DIR"
  else
    echo "Warning: dev-browser not found at $DEV_BROWSER_DIR"
    echo "Browser testing will be skipped"
  fi
}

# Cleanup function
cleanup() {
  if [ -n "$DEV_BROWSER_PID" ]; then
    echo "Stopping dev-browser server..."
    kill $DEV_BROWSER_PID 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Archive previous run if branch changed
if [ -f "$PRD_FILE" ] && [ -f "$LAST_BRANCH_FILE" ]; then
  CURRENT_BRANCH=$(jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null || echo "")
  LAST_BRANCH=$(cat "$LAST_BRANCH_FILE" 2>/dev/null || echo "")

  if [ -n "$CURRENT_BRANCH" ] && [ -n "$LAST_BRANCH" ] && [ "$CURRENT_BRANCH" != "$LAST_BRANCH" ]; then
    DATE=$(date +%Y-%m-%d)
    FOLDER_NAME=$(echo "$LAST_BRANCH" | sed 's|^ralph/||')
    ARCHIVE_FOLDER="$ARCHIVE_DIR/$DATE-$FOLDER_NAME"

    echo "Archiving previous run: $LAST_BRANCH"
    mkdir -p "$ARCHIVE_FOLDER"
    [ -f "$PRD_FILE" ] && cp "$PRD_FILE" "$ARCHIVE_FOLDER/"
    [ -f "$PROGRESS_FILE" ] && cp "$PROGRESS_FILE" "$ARCHIVE_FOLDER/"
    echo "   Archived to: $ARCHIVE_FOLDER"

    echo "# Ralph Progress Log" > "$PROGRESS_FILE"
    echo "Started: $(date)" >> "$PROGRESS_FILE"
    echo "---" >> "$PROGRESS_FILE"
  fi
fi

# Track current branch
if [ -f "$PRD_FILE" ]; then
  CURRENT_BRANCH=$(jq -r '.branchName // empty' "$PRD_FILE" 2>/dev/null || echo "")
  [ -n "$CURRENT_BRANCH" ] && echo "$CURRENT_BRANCH" > "$LAST_BRANCH_FILE"
fi

# Initialize progress file if it doesn't exist
if [ ! -f "$PROGRESS_FILE" ]; then
  echo "# Ralph Progress Log" > "$PROGRESS_FILE"
  echo "Started: $(date)" >> "$PROGRESS_FILE"
  echo "---" >> "$PROGRESS_FILE"
fi

echo "Starting Ralph - Max iterations: $MAX_ITERATIONS"
echo "Project directory: $PROJECT_DIR"
select_base_command
echo "Using base command: $BASE_CMD"

# Start dev-browser for UI testing
start_dev_browser

cd "$PROJECT_DIR"

for i in $(seq 1 $MAX_ITERATIONS); do
  echo ""
  echo "═══════════════════════════════════════════════════════"
  echo "  Ralph Iteration $i of $MAX_ITERATIONS"
  echo "═══════════════════════════════════════════════════════"

  # Run claude with the ralph prompt
  # Using print mode (-p) for non-interactive execution
  OUTPUT=$("$BASE_CMD" --dangerously-skip-permissions -p "$(cat "$SCRIPT_DIR/prompt.md")" 2>&1 | tee /dev/stderr) || true

  # Check for completion signal
  if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
    echo ""
    echo "Ralph completed all tasks!"
    echo "Completed at iteration $i of $MAX_ITERATIONS"
    exit 0
  fi

  echo "Iteration $i complete. Continuing..."
  sleep 2
done

echo ""
echo "Ralph reached max iterations ($MAX_ITERATIONS) without completing all tasks."
echo "Check $PROGRESS_FILE for status."
exit 1
