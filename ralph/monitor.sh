#!/bin/bash
# Ralph Monitor - watch progress in real-time
# Usage: ./monitor.sh (run in separate terminal)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "=== Ralph Monitor ==="
echo "Press Ctrl+C to exit"
echo ""

while true; do
  clear
  echo "═══════════════════════════════════════════════════════"
  echo "  Ralph Monitor - $(date '+%H:%M:%S')"
  echo "═══════════════════════════════════════════════════════"
  echo ""

  echo "📋 Story Status:"
  if [ -f ralph/prd.json ]; then
    cat ralph/prd.json | jq -r '.userStories[] | "  \(.id): \(if .passes then "✅" else "⏳" end) \(.title)"' 2>/dev/null || echo "  (error reading prd.json)"
  else
    echo "  (no prd.json found)"
  fi

  echo ""
  echo "📊 Progress:"
  TOTAL=$(cat ralph/prd.json 2>/dev/null | jq '.userStories | length' 2>/dev/null || echo 0)
  DONE=$(cat ralph/prd.json 2>/dev/null | jq '[.userStories[] | select(.passes == true)] | length' 2>/dev/null || echo 0)
  echo "  $DONE / $TOTAL stories complete"

  echo ""
  echo "📝 Recent Commits:"
  git log --oneline -5 2>/dev/null | sed 's/^/  /'

  echo ""
  echo "📜 Latest Progress Entry:"
  if [ -f ralph/progress.txt ]; then
    tail -20 ralph/progress.txt | head -15 | sed 's/^/  /'
  fi

  sleep 10
done
