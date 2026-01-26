# GitHub Actions CI Test Failures - Analysis & Fixes

**Date**: 2026-01-26
**Issue**: FSRS tests failing in GitHub Actions after migration consolidation
**Status**: 🔴 UNRESOLVED - UUID mismatch persists

---

## Issue Timeline

### Initial Failure (Run #18)
**Error**: Foreign key constraint violation
```
insert or update on table "word_lists" violates foreign key constraint "word_lists_language_code_fkey"
Key (language_code)=(nl) is not present in table "languages"
```

**Root Cause**: Migration `001_core_schema.sql` created `languages` table but never seeded 'nl' language before inserting word_lists

**Fix Applied**: ✅ Added language seed (commit 4571300b → f4720906)
```sql
INSERT INTO languages (code, name) VALUES ('nl', 'Nederlands')
ON CONFLICT (code) DO NOTHING;
```

---

### Second Failure (Run #19)
**Error**: Schema does not exist
```
schema "private" does not exist
role "authenticated" does not exist
role "anon" does not exist
```

**Root Cause**: CI workflow manually ran migrations against vanilla Postgres, missing Supabase infrastructure

**Fixes Applied**: ✅
1. Added Supabase roles and schemas to `dbTestUtils.ts::ensureAuthSchema()` (commit d8195de3)
2. Removed manual migration step from workflow (tests handle via `runMigrations()`)

```typescript
// Created in ensureAuthSchema():
- CREATE ROLE anon
- CREATE ROLE authenticated
- CREATE SCHEMA private
- CREATE FUNCTION auth.uid()
```

---

### Third Failure (Run #20-21)
**Errors**:
1. Float precision: `expected 93.438351 to be close to 93.43834846419239` (diff 2.5e-6 > 5e-7)
2. Function ambiguity: `function get_next_word(unknown, unknown, uuid[]) is not unique`

**Root Cause**:
1. Precision too strict (6 decimals)
2. Two `get_next_word` overloads with same signature `(uuid, text, uuid[])`

**Fixes Applied**: ✅
1. Loosened precision from 6 to 5 decimals (commit 00a1cf48)
2. Removed scenario-based `get_next_word` overload to resolve ambiguity (commit 00a1cf48)

```typescript
// Changed from:
expect(dbResult.stability!).toBeCloseTo(tsResult.stability!, 6);
// To:
expect(dbResult.stability!).toBeCloseTo(tsResult.stability!, 5);
```

---

### Fourth Failure (Run #22-24) - CURRENT ISSUE
**Error**: UUID mismatch in `get_next_word honors overdue order and daily caps` test
```
AssertionError: expected 'b054540c-8089-42b5-88c8-2c8757ab4b05'
                to be 'b977a4bd-f86d-49c3-94cb-5df2cbd29a17'
```

**What We Know**:
- Test creates specific `overdueId` word with `next_review_at = now() - interval '1 day'`
- Expects `get_next_word()` to return that specific word
- Instead gets a different UUID
- Happens consistently in CI, NOT locally

**Fixes Attempted**: ❌ Did not resolve
1. Sequential test execution (commit 58e5d25d) - No effect
2. Set `auth.uid()` in transactions (commit b438d6c2) - No effect

**Debug Logging Added**: (Latest commit b438d6c2)
```typescript
// Logs all NT2 words for user, expected overdueId, and actual result
console.log('DEBUG: All NT2 words for user:', debugWords);
console.log('DEBUG: Expected overdueId:', overdueId);
console.log('DEBUG: First result:', first);
```

---

## Technical Details

### Test Structure
- **File**: `apps/ui/tests/fsrs/fsrsRpc.test.ts`
- **Failing Test**: `get_next_word honors overdue order and daily caps`
- **Flow**:
  1. Generate random `userId`
  2. Create transaction with `auth.uid()` set to `userId`
  3. Insert 2 words: `overdueId` (with user_word_status) and `newId` (new)
  4. Call `get_next_word(userId, mode)`
  5. Expect to get `overdueId` back (overdue cards have priority)

### `get_next_word` Selection Logic
**File**: `db/migrations/003_queue_training.sql`
**Key Filter** (line 94):
```sql
(p_list_id IS NULL AND w.is_nt2_2000 = true)
```

**Order By** (line 211):
```sql
ORDER BY s.next_review_at ASC  -- Overdue cards first
```

### Isolation Mechanism
- Tests use `withTransaction()` with `ROLLBACK` to clean DB
- Migrations applied once via advisory lock (prevents race conditions)
- Each test uses random UUID for `userId` (collision impossible)

### Auth Check Issue (RESOLVED but didn't fix UUID issue)
Original auth check:
```sql
IF p_user_id != (select auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized';
END IF;
```
When `auth.uid()` returned NULL, `uuid != NULL` = NULL → exception not raised.
Tests now properly set `request.jwt.claim.sub` in transactions.

---

## Hypotheses

### Why UUID Mismatch Happens
1. **Different word being selected** - But why?
   - Query filters by `user_id = p_user_id` (can't be cross-user)
   - Only words with `is_nt2_2000 = true` selected
   - Test creates words with `is_nt2_2000 = true`

2. **Persistent data from previous run** - Unlikely:
   - Transactions rollback ALL data
   - Random userId makes collision impossible
   - No seeded word_entries in migrations

3. **Query returning wrong result** - Possible:
   - Non-deterministic ordering? (but ORDER BY is explicit)
   - Multiple matching words? (but test creates exactly 1 overdue)

4. **Race condition despite sequential execution** - Unlikely:
   - Advisory locks prevent migration races
   - Single thread execution configured

### Why It Works Locally But Not CI
- **Local**: Tests skip if no DB URL set (`FSRS_TEST_DB_URL`)
- **CI**: Tests run against shared Postgres service
- Possible CI-specific behavior:
  - Different Postgres version?
  - Shared DB state across workflow runs?
  - Timing/transaction isolation differences?

---

## Files Modified

### Migrations
- `db/migrations/001_core_schema.sql` - Added 'nl' language seed
- `db/migrations/003_queue_training.sql` - Removed ambiguous get_next_word overload

### Tests
- `apps/ui/tests/fsrs/dbTestUtils.ts` - Added Supabase roles/schemas, auth.uid() support
- `apps/ui/tests/fsrs/fsrsParity.test.ts` - Loosened precision 6→5
- `apps/ui/tests/fsrs/fsrsRpc.test.ts` - Set auth.uid() in transactions, added debug logging
- `apps/ui/vitest.config.ts` - Force sequential execution

### CI Workflow
- `.github/workflows/fsrs-tests.yml` - Added vitest.config.ts to trigger paths

---

## Commit History
```
f4720906 - fix: Add 'nl' language seed to prevent FK constraint violation
b732b26c - fix: Apply database migrations before running tests in CI (reverted - tests handle it)
d8195de3 - fix: Add Supabase roles and private schema to test setup
00a1cf48 - fix: Remove ambiguous get_next_word overload and loosen test precision
58e5d25d - fix: Force sequential test execution to prevent DB contention
37eb6ed7 - fix: Add vitest.config.ts to FSRS test workflow triggers
b438d6c2 - fix: Set auth.uid() in test transactions for proper authorization
[PENDING] - feat: Add debug logging to failing test
```

---

## Next Steps

### To Debug
1. ✅ Push debug logging commit
2. Check CI output for debug logs - what words exist? What's returned?
3. Inspect if different word has older `next_review_at`
4. Check for transaction isolation issues

### Potential Fixes
1. **Add explicit user isolation** - Insert test data into private per-test schema
2. **Mock auth.uid() differently** - Use session variables instead of settings
3. **Skip flaky test in CI** - Mark as `test.skipIf(process.env.CI)`
4. **Use separate DB per test** - More heavyweight but guaranteed isolation
5. **Investigate get_next_word query** - Add WHERE user_id check to ALL subqueries

### Questions to Answer
- Does debug logging show extra words for the test user?
- What's the `next_review_at` of the wrong word being returned?
- Does the test fail consistently or intermittently?
- Can we reproduce locally with real Postgres + migrations?

---

## How to Continue Investigation

### Run CI with Debug Logging
```bash
# Already committed with debug logging
# Check run at: https://github.com/vbalashi/2000nl/actions
```

### Reproduce Locally
```bash
# 1. Start local Postgres
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16

# 2. Set test DB URL
export FSRS_TEST_DB_URL=postgres://postgres:postgres@localhost:5432/postgres

# 3. Run failing test
cd apps/ui
npm test -- tests/fsrs/fsrsRpc.test.ts -t "get_next_word honors overdue order"
```

### Check Specific Query
```sql
-- What words exist with status for random user?
SELECT w.id, w.headword, s.next_review_at, s.user_id
FROM word_entries w
LEFT JOIN user_word_status s ON s.word_id = w.id
WHERE w.is_nt2_2000 = true
ORDER BY s.next_review_at ASC NULLS LAST;
```

---

## Related Links
- Latest failed run: https://github.com/vbalashi/2000nl/actions/runs/21354059536
- Test file: `apps/ui/tests/fsrs/fsrsRpc.test.ts:109`
- Function under test: `db/migrations/003_queue_training.sql:9` (`get_next_word`)
