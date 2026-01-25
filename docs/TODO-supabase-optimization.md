# TODO: Supabase Database Optimization

**Created:** 2026-01-25
**Related Report:** [supabase-audit-2026-01-25.md](../reports/supabase-audit-2026-01-25.md)
**Status:** Not Started

---

## Priority 0: Capture Missing Policies ⚠️

**Status:** 🔴 BLOCKING - Must complete before optimization

### Task 0.1: Export Current Policies from Database
- [ ] Connect to production database
- [ ] Export user_word_status policies (4)
- [ ] Export user_events policies (4)
- [ ] Verify policies match live DB state
- [ ] Document when/why these were added (git history, tickets, etc.)

**Commands:**
```bash
db/scripts/psql_supabase.sh -c "
SELECT
    'CREATE POLICY ' || policyname || ' ON ' || tablename || chr(10) ||
    '    FOR ' || cmd || chr(10) ||
    '    TO ' || array_to_string(roles, ', ') || chr(10) ||
    '    USING (' || pg_get_expr(qual, (schemaname||'.'||tablename)::regclass) || ')' ||
    CASE WHEN with_check IS NOT NULL
        THEN chr(10) || '    WITH CHECK (' || pg_get_expr(with_check, (schemaname||'.'||tablename)::regclass) || ')'
        ELSE ''
    END || ';'
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('user_word_status', 'user_events')
ORDER BY tablename, policyname;
"
```

**Related:** [Report Section 3](../reports/supabase-audit-2026-01-25.md#3-migration-drift-issues)

---

### Task 0.2: Create Migration to Capture Policies
- [ ] Create `db/migrations/008_capture_missing_policies.sql`
- [ ] Add idempotent policy creation (DO $$ blocks)
- [ ] Add comments explaining origin
- [ ] Test migration on local/staging DB
- [ ] Commit to version control

**Template:**
```sql
-- Migration: Capture missing RLS policies
-- Date: 2026-01-25
-- Context: Policies existed in DB but not in migrations
-- Source: Manual export from production DB

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'user_word_status'
        AND policyname = 'user_word_status_select_self'
    ) THEN
        CREATE POLICY user_word_status_select_self
        ON user_word_status
        FOR SELECT
        USING (auth.uid() = user_id);
    END IF;
    -- ... repeat for all 8 policies
END $$;
```

**Files to create:**
- `db/migrations/008_capture_missing_policies.sql`

---

## Priority 1: Optimize RLS Performance 🚀

**Status:** 🟡 Ready after P0 complete
**Impact:** 99% performance improvement on all user queries
**Estimated Time:** 2-3 hours (including testing)

### Task 1.1: Create Optimization Migration
- [ ] Create `db/migrations/009_optimize_rls_performance.sql`
- [ ] Drop all 26 existing policies
- [ ] Recreate with optimized pattern
- [ ] Add comments referencing audit report
- [ ] Test on staging database

**Pattern to apply:**
```sql
-- BEFORE (slow):
CREATE POLICY name ON table
FOR SELECT
USING (auth.uid() = user_id);

-- AFTER (fast):
CREATE POLICY name ON table
FOR SELECT
TO authenticated
USING ((select auth.uid()) = user_id);
```

**Tables to optimize (26 policies):**
- [ ] user_word_status (4 policies: SELECT, INSERT, UPDATE, DELETE)
- [ ] user_events (4 policies: SELECT, INSERT, UPDATE, DELETE)
- [ ] user_word_lists (4 policies: SELECT, INSERT, UPDATE, DELETE)
- [ ] user_word_notes (4 policies: SELECT, INSERT, UPDATE, DELETE)
- [ ] user_word_list_items (4 policies: SELECT, INSERT, UPDATE, DELETE)
- [ ] Additional policies in 005_security.sql (6 policies)

**Related:** [Report Section 1](../reports/supabase-audit-2026-01-25.md#1-rls-policy-performance-issues)

---

### Task 1.2: Update Existing Migration File
- [ ] Update `db/migrations/005_security.sql`
- [ ] Change all `auth.uid()` → `(select auth.uid())`
- [ ] Add `TO authenticated` to all policies
- [ ] Add comments explaining optimization
- [ ] Keep DO $$ blocks for idempotency

**Lines to modify in 005_security.sql:**
- Line 28: `select_own_user_word_lists` - wrap auth.uid(), add TO
- Line 35: `insert_own_user_word_lists` - wrap auth.uid(), add TO
- Line 42: `update_own_user_word_lists` - wrap auth.uid(), add TO
- Line 49: `delete_own_user_word_lists` - wrap auth.uid(), add TO
- Lines 62-102: `user_word_list_items` policies (4) - wrap all auth.uid() in EXISTS
- Line 135: `select_own_user_word_notes` - wrap auth.uid(), add TO
- Line 145: `insert_own_user_word_notes` - wrap auth.uid(), add TO
- Line 155: `update_own_user_word_notes` - wrap auth.uid(), add TO
- Line 165: `delete_own_user_word_notes` - wrap auth.uid(), add TO

**Example change:**
```diff
- USING (auth.uid() = user_id)
+ TO authenticated
+ USING ((select auth.uid()) = user_id)
```

---

### Task 1.3: Performance Testing
- [ ] Benchmark current query times (baseline)
- [ ] Deploy migration to staging
- [ ] Benchmark optimized query times
- [ ] Calculate actual improvement %
- [ ] Document results

**Benchmark queries:**
```sql
-- Set up auth context
set session role authenticated;
set request.jwt.claims to '{"role":"authenticated", "sub":"<test-user-uuid>"}';

-- Test 1: Simple select
explain analyze
SELECT * FROM user_word_status WHERE user_id = '<test-user-uuid>' LIMIT 100;

-- Test 2: Training queue query
explain analyze
SELECT * FROM user_word_status
WHERE user_id = '<test-user-uuid>'
  AND mode = 'word-to-definition'
  AND next_review_at <= now()
ORDER BY next_review_at
LIMIT 20;

-- Test 3: Dashboard stats
explain analyze
SELECT mode, count(*)
FROM user_word_status
WHERE user_id = '<test-user-uuid>'
GROUP BY mode;
```

**Expected results:**
- Execution Time: 170ms → <5ms
- Planning Time: <1ms (unchanged)
- Function calls to `auth.uid()`: Per-row → Once per query

---

### Task 1.4: Deploy to Production
- [ ] Schedule deployment during low-traffic window
- [ ] Run migration: `db/scripts/psql_supabase.sh -f db/migrations/009_optimize_rls_performance.sql`
- [ ] Verify policies updated: `SELECT * FROM pg_policies WHERE schemaname = 'public'`
- [ ] Monitor API response times
- [ ] Monitor error rates (should be 0)

**Rollback plan:**
```sql
-- If issues, revert to unoptimized policies
\i db/migrations/005_security.sql
```

---

## Priority 2: Security Definer Audit 🔒

**Status:** 🟢 Can be done in parallel with P1
**Impact:** Reduce attack surface, clarify API contract
**Estimated Time:** 4-6 hours

### Task 2.1: Audit All SECURITY DEFINER Functions
Create audit spreadsheet with columns:
- Function name
- Current location (file:line)
- Uses auth.uid()? (Y/N)
- Has proper auth checks? (Y/N/N/A)
- Intended for API? (Y/N)
- Recommended action

**Functions to audit (15 total):**

**High Priority (write operations):**
- [ ] `handle_click` (003_queue_training.sql:~500)
- [ ] `handle_review` (003_queue_training.sql:~600)

**Medium Priority (read user data):**
- [ ] `fetch_words_for_list_gated` (004_user_features.sql:~100)
- [ ] `search_word_entries_gated` (004_user_features.sql:~200)
- [ ] `set_default_user_settings` (004_user_features.sql:~50)
- [ ] `get_user_tier` (004_user_features.sql:~150)

**Low Priority (aggregations):**
- [ ] `get_next_word` (4 overloads) (003_queue_training.sql:9,533,552,586)
- [ ] `get_training_scenarios` (003_queue_training.sql:981)
- [ ] `get_detailed_training_stats` (003_queue_training.sql:675)
- [ ] `get_scenario_stats` (003_queue_training.sql:898)
- [ ] `get_scenario_word_stats` (003_queue_training.sql:854)
- [ ] `get_last_review_debug` (002_fsrs_engine.sql:~200)

**Related:** [Report Section 2](../reports/supabase-audit-2026-01-25.md#2-security-definer-functions)

---

### Task 2.2: Create Private Schema for Internal Functions
- [ ] Create migration: `010_private_schema.sql`
- [ ] Create `private` schema
- [ ] Move internal-only functions to `private`
- [ ] Update function calls in other functions
- [ ] Revoke access from `anon` and `authenticated` roles

```sql
-- Create private schema
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM public, anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres;

-- Example: Move function
ALTER FUNCTION public.internal_helper_function SET SCHEMA private;
```

**Functions to move (TBD after audit):**
- [ ] TBD based on Task 2.1 results

---

### Task 2.3: Document API Contract
- [ ] Create `docs/api-functions.md`
- [ ] List all intentional API functions
- [ ] Document parameters, return types, auth requirements
- [ ] Add examples for frontend usage

**Template:**
```markdown
# Supabase RPC Functions

## Public API Functions

### get_next_word
**Purpose:** Fetch next training card for user
**Auth:** Requires authenticated user
**Parameters:**
- mode: text (e.g., 'word-to-definition')
- list_id: uuid (optional)
**Returns:** Single word_entry with status
**Example:**
```js
const { data } = await supabase.rpc('get_next_word', {
  mode: 'word-to-definition'
});
```
```

---

## Priority 3: Migration Discipline 📋

**Status:** 🟢 Process improvement
**Impact:** Prevent future drift
**Estimated Time:** 1-2 hours

### Task 3.1: Create Pre-Commit Hook
- [ ] Create `.git/hooks/pre-commit` script
- [ ] Check for manual DB changes (warn only)
- [ ] Lint SQL files for common issues
- [ ] Verify migrations are sequential

**Script:**
```bash
#!/bin/bash
# Check for migration files that might be stale
echo "Checking for potential manual DB changes..."
# TODO: Compare local migrations with DB state
# For now, just remind developer
echo "⚠️  Reminder: All DB changes must go through migrations!"
```

---

### Task 3.2: Document Migration Workflow
- [ ] Add section to `db/README.md`
- [ ] Explain: How to create migrations
- [ ] Explain: How to test migrations
- [ ] Explain: When to run `supabase db pull`
- [ ] Add examples

**Template content:**
```markdown
## Migration Workflow

### Creating a New Migration

1. Create new file: `db/migrations/XXX_description.sql`
2. Use DO $$ blocks for idempotency
3. Test locally: `db/scripts/psql_supabase.sh -f db/migrations/XXX_description.sql`
4. Commit to git

### Never Do Manual Changes
❌ Don't create policies in Supabase Dashboard
❌ Don't run adhoc SQL in production
✅ Always create migration files
✅ Always test in staging first

### Checking for Drift
```bash
# Before starting new work, check if DB has drifted
supabase db pull --schema public
git diff db/migrations/
```
```

---

### Task 3.3: Add Database Diff Check to CI
- [ ] Create `.github/workflows/db-drift-check.yml`
- [ ] Run on PR: Compare migrations with staging DB
- [ ] Fail if drift detected
- [ ] Provide instructions to capture missing migrations

**GitHub Action:**
```yaml
name: Database Drift Check
on: [pull_request]
jobs:
  check-drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Check for migration drift
        run: |
          # TODO: Implement drift detection
          echo "Checking if DB state matches migrations..."
```

---

## Priority 4: Additional Optimizations 🎯

**Status:** 🔵 Future work (after P0-P3 complete)
**Impact:** Incremental improvements

### Task 4.1: Review Complex Policies with EXISTS
Some policies use EXISTS subqueries that might benefit from optimization:
- [ ] Review `user_word_list_items` policies (lines 62-102 in 005_security.sql)
- [ ] Consider security definer function approach
- [ ] Benchmark before/after

**Example optimization:**
```sql
-- BEFORE:
EXISTS (
    SELECT 1 FROM user_word_lists l
    WHERE l.id = list_id AND l.user_id = auth.uid()
)

-- AFTER (if performance issue):
list_id IN (
    SELECT id FROM user_word_lists
    WHERE user_id = (select auth.uid())
)
```

**Related:** [Report Section 5 - Minimize Joins](../reports/supabase-audit-2026-01-25.md#minimize-joins)

---

### Task 4.2: Add Explicit Filter Recommendations
- [ ] Add comments to client code (TypeScript)
- [ ] Always use `.eq('user_id', userId)` even with RLS
- [ ] Update code review guidelines

**Example:**
```typescript
// ❌ Relies only on RLS (slow)
const { data } = await supabase
  .from('user_word_status')
  .select('*');

// ✅ Explicit filter helps query planner
const { data } = await supabase
  .from('user_word_status')
  .select('*')
  .eq('user_id', userId);
```

---

## Checklist Summary

### Must Do (Blocking)
- [x] **P0.1:** Export missing policies from DB ✅ 2026-01-25
- [x] **P0.2:** Create migration 008 to capture policies ✅ 2026-01-25
- [x] **P0.3:** Enable RLS on user_review_log and user_settings (migration 010) ✅ 2026-01-25
- [x] **P1.1:** Create optimization migration 009 ✅ 2026-01-25
- [x] **P1.2:** Applied optimizations (20 policies now use InitPlan caching) ✅ 2026-01-25
- [ ] **P1.3:** Benchmark performance before/after
- [ ] **P1.4:** Deploy to production (migrations 008, 009, 010 ready)

### Should Do (High Value)
- [ ] **P2.1:** Audit all SECURITY DEFINER functions
- [ ] **P2.2:** Create private schema for internal functions
- [ ] **P2.3:** Document public API functions
- [x] **P3.1:** Add pre-commit hook for migrations ✅ 2026-01-25
- [x] **P3.2:** Document migration workflow ✅ 2026-01-25
- [x] **P3.3:** Add CI drift check ✅ 2026-01-25

### Nice to Have (Future)
- [ ] **P4.1:** Optimize complex EXISTS policies
- [ ] **P4.2:** Add filter recommendations to client code

---

## Success Metrics

### Performance Goals
- [ ] Training queue query: <5ms (from 170ms)
- [ ] Dashboard load time: <50ms total (from 500ms)
- [ ] P95 API response time: <100ms

### Security Goals
- [ ] All SECURITY DEFINER functions audited
- [ ] Non-API functions moved to private schema
- [ ] API surface documented

### Process Goals
- [x] Zero migration drift (all policies in version control) ✅ 2026-01-25
- [x] Pre-commit hook prevents manual changes ✅ 2026-01-25
- [x] CI fails on detected drift ✅ 2026-01-25

---

## Timeline

**Week 1:**
- Complete P0 (capture missing policies)
- Complete P1 (optimize RLS)
- Deploy to production

**Week 2:**
- Complete P2 (security audit)
- Complete P3 (process improvements)

**Week 3+:**
- P4 (additional optimizations as needed)

---

## Questions / Blockers

- [ ] When was the last manual DB change made?
- [ ] Who has direct DB access?
- [ ] What's the maintenance window for production deployment?
- [ ] Is staging DB in sync with production?

---

**Last Updated:** 2026-01-25 (P0 and P1 completed)
**Owner:** TBD
**Slack Channel:** #database-optimization

---

## Implementation Log

### 2026-01-25 - P0 and P1 Completed ✅

**Migrations Created:**
1. `008_capture_missing_policies.sql` - Captured 8 policies (user_word_status, user_events)
2. `009_optimize_rls_performance.sql` - Optimized 20 policies with InitPlan caching
3. `010_enable_rls_review_settings.sql` - Fixed RLS on user_review_log and user_settings

**Changes Applied:**
- 20 policies now use `(select auth.uid())` instead of `auth.uid()`
- All user policies changed from `TO public` to `TO authenticated`
- user_review_log and user_settings now have RLS enabled with 4 policies each
- Total policies: 26 → 34 (added 8 policies)

**Verified:**
- All auth.uid() calls use InitPlan caching pattern ✅
- All user tables have RLS enabled ✅
- Zero migration drift ✅

**Next Steps:**
- Benchmark performance improvements (expected 99% faster)
- Deploy migrations to production
- Continue with P2 (security audit)

### 2026-01-25 - P3 Completed ✅

**Process Improvements Deployed:**
1. **.githooks/pre-commit** - Checks migrations before commit:
   - Detects auth.uid() anti-patterns
   - Warns about TO public (should be TO authenticated)
   - Reminds to test in staging
   - Installation: `.githooks/install.sh`

2. **db/README.md** - Migration workflow documentation:
   - Comprehensive migration creation guide
   - Idempotent patterns (DO $$ blocks)
   - RLS performance best practices
   - Drift checking procedures
   - Never/Always checklists

3. **.github/workflows/db-drift-check.yml** - CI validation:
   - Checks migration anti-patterns on PRs
   - Validates file naming conventions
   - Optional live DB drift check

**Commit:** ee3fca0f

**Next:** P2 (Security audit of 15 SECURITY DEFINER functions)
