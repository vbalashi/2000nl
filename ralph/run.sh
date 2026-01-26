#!/bin/bash
# Ralph Runner - Interactive launcher with command selection
# Presents all available options and launches appropriate script
#
# Usage:
#   Interactive:  ./run.sh
#   CLI args:     ./run.sh <command> <mode> [max_iterations]
#
# Examples:
#   ./run.sh sonnet loop 10
#   ./run.sh opus once
#   ./run.sh claude loop

set -e

# Source .bashrc to get bash functions (sonnet_foundry, opus_copilot, etc.)
if [ -f "$HOME/.bashrc" ]; then
  source "$HOME/.bashrc"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Parse CLI arguments
if [ $# -gt 0 ]; then
  # Non-interactive mode with CLI args
  CMD_ARG="$1"
  MODE_ARG="${2:-loop}"
  MAX_ITER="${3:-10}"

  # Validate command
  case "$CMD_ARG" in
    claude|sonnet|opus|sonnet_foundry|sonnet_copilot|opus_copilot|codex_copilot)
      export RALPH_CMD="$CMD_ARG"
      ;;
    *)
      echo "Error: Invalid command '$CMD_ARG'"
      echo ""
      echo "Valid commands: claude, sonnet, opus, sonnet_foundry,"
      echo "                sonnet_copilot, opus_copilot, codex_copilot"
      exit 1
      ;;
  esac

  # Validate mode
  case "$MODE_ARG" in
    loop)
      echo "Starting Ralph loop mode with $RALPH_CMD..."
      echo "Max iterations: $MAX_ITER"
      echo ""
      sleep 1
      exec "$SCRIPT_DIR/ralph.sh" "$MAX_ITER"
      ;;
    once)
      echo "Starting Ralph once mode with $RALPH_CMD..."
      echo ""
      sleep 1
      exec "$SCRIPT_DIR/ralph-once.sh"
      ;;
    *)
      echo "Error: Invalid mode '$MODE_ARG'"
      echo "Valid modes: loop, once"
      exit 1
      ;;
  esac
fi

# Interactive mode
echo "═══════════════════════════════════════════════════════"
echo "  Ralph - AI Agent Runner"
echo "═══════════════════════════════════════════════════════"
echo ""

# Step 1: Select command
echo "Select command to use:"
echo ""
echo "  Standard:"
echo "    1) claude              (Default Claude Sonnet)"
echo ""
echo "  CLIProxyAPI (local proxy):"
echo "    2) sonnet              (Claude Sonnet 4.5 via proxy)"
echo "    3) opus                (Gemini Claude Opus 4.5 via proxy)"
echo ""
echo "  Microsoft Foundry:"
echo "    4) sonnet_foundry      (Claude Sonnet 4.5 via Foundry)"
echo ""
echo "  GitHub Copilot:"
echo "    5) sonnet_copilot      (Sonnet 4.5 via Copilot)"
echo "    6) opus_copilot        (Opus 4.5 via Copilot)"
echo "    7) codex_copilot       (Codex 5.1 via Copilot)"
echo ""
echo "    8) Custom command      (enter manually)"
echo ""
read -r -p "Choice [1]: " cmd_choice
cmd_choice="${cmd_choice:-1}"

case "$cmd_choice" in
  1)
    export RALPH_CMD="claude"
    ;;
  2)
    export RALPH_CMD="sonnet"
    ;;
  3)
    export RALPH_CMD="opus"
    ;;
  4)
    export RALPH_CMD="sonnet_foundry"
    ;;
  5)
    export RALPH_CMD="sonnet_copilot"
    ;;
  6)
    export RALPH_CMD="opus_copilot"
    ;;
  7)
    export RALPH_CMD="codex_copilot"
    ;;
  8)
    read -r -p "Enter command: " custom_cmd
    export RALPH_CMD="$custom_cmd"
    ;;
  *)
    echo "Invalid choice, defaulting to claude"
    export RALPH_CMD="claude"
    ;;
esac

echo ""
echo "Using command: $RALPH_CMD"
echo ""

# Step 2: Select mode
echo "Select mode:"
echo "  1) Loop mode     (multiple iterations until complete)"
echo "  2) Once mode     (single interactive iteration)"
echo ""
read -r -p "Choice [1]: " mode_choice
mode_choice="${mode_choice:-1}"

case "$mode_choice" in
  1)
    # Loop mode - ask for max iterations
    echo ""
    read -r -p "Max iterations [10]: " max_iter
    max_iter="${max_iter:-10}"

    echo ""
    echo "Starting Ralph loop mode with $RALPH_CMD..."
    echo "Max iterations: $max_iter"
    echo ""
    sleep 1

    exec "$SCRIPT_DIR/ralph.sh" "$max_iter"
    ;;
  2)
    # Once mode
    echo ""
    echo "Starting Ralph once mode with $RALPH_CMD..."
    echo ""
    sleep 1

    exec "$SCRIPT_DIR/ralph-once.sh"
    ;;
  *)
    echo "Invalid choice, exiting"
    exit 1
    ;;
esac
