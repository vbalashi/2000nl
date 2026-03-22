# Supabase Optimization: RLS Performance

## Priority 0: Capture Missing Policies

### Task 0.1: Export Current Policies From Database
- Connect to production database
- Export `user_word_status` policies
- Export `user_events` policies
- Verify they match live DB state
- Document provenance

### Task 0.2: Create Migration To Capture Policies
- Create `db/migrations/008_capture_missing_policies.sql`
- Use idempotent policy creation
- Test on non-prod DB

## Priority 1: Optimize RLS Performance

### Task 1.1: Create Optimization Migration
- Create `db/migrations/009_optimize_rls_performance.sql`
- Recreate policies with `(select auth.uid())`
- Add `TO authenticated`
- Test on staging

**Target pattern:**
```sql
CREATE POLICY name ON table
FOR SELECT
TO authenticated
USING ((select auth.uid()) = user_id);
```

### Task 1.2: Update Existing Migration File
- Update `db/migrations/005_security.sql`
- Replace `auth.uid()` with `(select auth.uid())`
- Add `TO authenticated`
- Keep idempotent `DO $$` style where needed

### Task 1.3: Performance Testing
- Measure baseline query times
- Apply optimized migrations on staging
- Re-run benchmark queries
- Record actual improvement

**Expected outcome:**
- Execution time: 170ms to under 5ms
- Planning time unchanged
- `auth.uid()` resolution once per query instead of per row

### Task 1.4: Deploy To Production
- Use low-traffic deployment window
- Apply migration 009
- Verify resulting policies
- Monitor response times and error rates

## Priority 4: Additional Optimizations

### Task 4.1: Review Complex Policies With EXISTS
- Revisit `user_word_list_items` policies
- Benchmark current EXISTS forms
- Consider alternative shapes only if they improve measurable performance

### Task 4.2: Add Explicit Filter Recommendations
- Document `.eq('user_id', userId)` guidance in client code and reviews
- Prefer explicit user filters even when RLS already applies
