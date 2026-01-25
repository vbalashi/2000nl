#!/bin/bash
# Install git hooks from .githooks/ directory

set -e

HOOKS_DIR=".githooks"
GIT_HOOKS_DIR=".git/hooks"

echo "Installing git hooks..."

# Check if .git directory exists
if [ ! -d ".git" ]; then
    echo "Error: Not in a git repository root directory"
    exit 1
fi

# Install pre-commit hook
if [ -f "$HOOKS_DIR/pre-commit" ]; then
    cp "$HOOKS_DIR/pre-commit" "$GIT_HOOKS_DIR/pre-commit"
    chmod +x "$GIT_HOOKS_DIR/pre-commit"
    echo "✓ Installed pre-commit hook"
else
    echo "Warning: pre-commit hook not found in $HOOKS_DIR"
fi

echo ""
echo "✓ Git hooks installed successfully!"
echo ""
echo "Hooks installed:"
echo "  - pre-commit: Checks migration anti-patterns"
echo ""
echo "To bypass hooks temporarily: git commit --no-verify"
