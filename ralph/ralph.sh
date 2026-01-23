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
LAST_MESSAGE_FILE="$ARCHIVE_DIR/last-message.txt"
RUN_MODE=""

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

  case "$(basename "$BASE_CMD")" in
    codex)
      RUN_MODE="codex"
      ;;
    claude)
      RUN_MODE="claude"
      ;;
    *)
      RUN_MODE="generic"
      ;;
  esac
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

run_agent_prompt() {
  local prompt_file="$1"
  local output_file="$2"

  case "$RUN_MODE" in
    codex)
      if [ -n "$output_file" ]; then
        : > "$output_file"
        "$BASE_CMD" exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check -o "$output_file" "$(cat "$prompt_file")"
      else
        "$BASE_CMD" exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check "$(cat "$prompt_file")"
      fi
      ;;
    claude)
      [ -n "$output_file" ] && : > "$output_file"
      "$BASE_CMD" --dangerously-skip-permissions -p "$(cat "$prompt_file")"
      ;;
    *)
      [ -n "$output_file" ] && : > "$output_file"
      "$BASE_CMD" "$(cat "$prompt_file")"
      ;;
  esac
}

run_agent_task() {
  local task_prompt="$1"
  case "$RUN_MODE" in
    codex)
      "$BASE_CMD" exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check "$task_prompt"
      ;;
    claude)
      "$BASE_CMD" "$task_prompt"
      ;;
    *)
      "$BASE_CMD" "$task_prompt"
      ;;
  esac
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

mkdir -p "$ARCHIVE_DIR"

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

  previous_passes=""
  if [ -f "$PRD_FILE" ]; then
    previous_passes=$(jq -r '.userStories[]? | select(.passes == true) | .id' "$PRD_FILE" 2>/dev/null | sort -u)
  fi

  # Run agent with the ralph prompt
  OUTPUT=$(run_agent_prompt "$SCRIPT_DIR/prompt.md" "$LAST_MESSAGE_FILE" 2>&1 | tee /dev/stderr) || true

  # Update app-behavior.md with completed feature
  if [ -f "$PRD_FILE" ]; then
    current_passes=$(jq -r '.userStories[]? | select(.passes == true) | .id' "$PRD_FILE" 2>/dev/null | sort -u)
    new_passes=$(comm -13 <(printf '%s\n' "$previous_passes") <(printf '%s\n' "$current_passes") | sed '/^$/d')
    if [ -n "$new_passes" ]; then
      while IFS= read -r story_id; do
        [ -z "$story_id" ] && continue
        echo "Updating docs/app-behavior.md..."
        run_agent_task "Read ralph/prd.json story $story_id and docs/app-behavior.md. Add a brief feature entry (2-4 sentences) documenting what changed." || true
      done <<< "$new_passes"
    fi
  fi

  # Check for completion signal
  if { [ -n "$LAST_MESSAGE_FILE" ] && [ -s "$LAST_MESSAGE_FILE" ] && grep -q "<promise>COMPLETE</promise>" "$LAST_MESSAGE_FILE"; } \
    || echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
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
