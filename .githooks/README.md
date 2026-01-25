# Git Hooks

Custom git hooks to prevent common database migration issues.

## Installation

### Quick Install (Recommended)

```bash
# Install all hooks at once
.githooks/install.sh
```

### Manual Install

```bash
# Install pre-commit hook
cp .githooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

## Available Hooks

### pre-commit

Checks for migration anti-patterns before commits:

**What it does:**
- ✓ Detects migration file changes
- ⚠️ Reminds you to test migrations in staging
- ⚠️ Warns about SQL files outside `db/migrations/`
- ❌ Detects non-optimized `auth.uid()` (should be `(select auth.uid())`)
- ❌ Detects `TO public` in policies (should be `TO authenticated`)

**Output example:**
```
✓ Migration files detected:
  - db/migrations/011_new_feature.sql

⚠️  MIGRATION CHECKLIST:
  1. Did you test this migration in staging?
  2. Is the migration idempotent (DO $$ blocks)?
  3. Does it use optimized RLS patterns?
     - (select auth.uid()) not auth.uid()
     - TO authenticated not TO public

If yes to all, proceed with commit.
```

**Bypassing the hook:**
If you need to commit anyway (e.g., WIP commit):
```bash
git commit --no-verify
```

## Why These Hooks?

After discovering migration drift and performance issues (see `reports/supabase-audit-2026-01-25.md`), these hooks prevent:
- Manual schema changes not captured in migrations
- Slow RLS policies (99% performance penalty)
- Untested migrations deployed to production
