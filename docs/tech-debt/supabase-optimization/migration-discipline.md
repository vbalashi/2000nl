# Supabase Optimization: Migration Discipline

## Priority 3: Migration Discipline

### Task 3.1: Pre-Commit Hook
- Check for common migration anti-patterns
- Warn about possible manual DB drift
- Keep this guardrail lightweight and local

Example reminder:
```bash
echo "Reminder: all DB changes must go through migrations"
```

### Task 3.2: Migration Workflow
- Document how to create migrations
- Document how to test them
- Document how and when to check drift

### Task 3.3: Database Diff Check In CI
- Run on pull requests
- Validate migration anti-patterns
- Add stronger live drift checking only when the repo can support it safely

## Canonical Workflow

### Creating A New Migration
1. Create `db/migrations/XXX_description.sql`
2. Prefer idempotent patterns
3. Test locally or on staging
4. Commit the migration with the code that depends on it

### Never Do Manual Changes
- Do not create production policies only in the Supabase dashboard
- Do not rely on ad hoc SQL as the source of truth
- Always capture DB behavior in migrations

### Checking For Drift
```bash
supabase db pull --schema public
git diff db/migrations/
```

## Delivered Improvements

- `.githooks/pre-commit`
- `db/README.md` migration guidance
- `.github/workflows/db-drift-check.yml`
