# SECURITY DEFINER Functions Audit

**Date:** 2026-01-25
**Auditor:** Claude Code
**Context:** P2 Security Audit from supabase-audit-2026-01-25.md

---

## Summary

15 SECURITY DEFINER functions exposed via PostgREST API endpoint:
```
POST https://lliwdcpuuzjmxyzrjtoz.supabase.co/rest/v1/rpc/<function_name>
```

**Security Risk:** All functions in `public` schema are callable by anyone with an API key.

---

## Audit Results

| # | Function | File:Line | Risk | Has Auth Check | Uses auth.uid() | Intended API | Action |
|---|----------|-----------|------|----------------|-----------------|--------------|--------|
| 1 | `handle_review` | 002:189 | 🔴 HIGH | ❌ NO | ❌ NO | ✅ YES | ADD AUTH CHECK |
| 2 | `handle_click` | 002:337 | 🔴 HIGH | ❌ NO | ❌ NO | ✅ YES | ADD AUTH CHECK |
| 3 | `get_last_review_debug` | 002:453 | 🟡 LOW | ❌ NO | ❌ NO | ❓ MAYBE | ADD AUTH OR MOVE PRIVATE |
| 4 | `set_default_user_settings` | 004:44 | 🟢 OK | ✅ TRIGGER | N/A | ❌ NO | KEEP (trigger) |
| 5 | `get_user_tier` | 004:137 | 🟡 MEDIUM | ❌ NO | ❌ NO | ✅ YES | ADD AUTH CHECK |
| 6 | `fetch_words_for_list_gated` | 004:165 | 🟢 OK | ✅ YES (L264) | ✅ YES | ✅ YES | OK |
| 7 | `search_word_entries_gated` | 004:247 | 🟢 OK | ✅ YES (L182) | ✅ YES | ✅ YES | OK |
| 8 | `get_next_word` (4 overloads) | 003:9,533,552,586 | 🔴 HIGH | ❌ NO | ❌ NO | ✅ YES | ADD AUTH CHECK |
| 9 | `get_detailed_training_stats` | 003:675 | 🟡 MEDIUM | ❌ NO | ❌ NO | ✅ YES | ADD AUTH CHECK |
| 10 | `get_scenario_word_stats` | 003:854 | 🟡 MEDIUM | ❌ NO | ❌ NO | ✅ YES | ADD AUTH CHECK |
| 11 | `get_scenario_stats` | 003:898 | 🟡 MEDIUM | ❌ NO | ❌ NO | ✅ YES | ADD AUTH CHECK |
| 12 | `get_training_scenarios` | 003:981 | 🟢 LOW | N/A | N/A | ✅ YES | OK (static data) |

---

## Critical Findings

### 🔴 HIGH RISK: Write Operations Without Auth

#### 1. `handle_review` (002_fsrs_engine.sql:189)
```sql
CREATE OR REPLACE FUNCTION handle_review(
    p_user_id uuid,
    p_word_id uuid,
    p_mode text,
    p_result text
)
SECURITY DEFINER
```

**Issue:** Takes `p_user_id` as parameter but doesn't verify caller owns that user_id.

**Attack:** Malicious user can call:
```javascript
await supabase.rpc('handle_review', {
  p_user_id: '<victim-uuid>',
  p_word_id: '<any-word>',
  p_mode: 'word-to-definition',
  p_result: 'hide'
})
```

**Impact:** Can modify another user's training data, hide cards, manipulate FSRS state.

**Fix Required:**
```sql
BEGIN
    -- ADD THIS AT START
    IF p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    -- existing code...
END $$;
```

---

#### 2. `handle_click` (002_fsrs_engine.sql:337)
```sql
CREATE OR REPLACE FUNCTION handle_click(
    p_user_id uuid,
    p_word_id uuid,
    p_mode text
)
SECURITY DEFINER
```

**Issue:** Same as handle_review - no auth check.

**Attack:** Can trigger "show answer" events for any user, corrupting their FSRS schedule.

**Fix Required:** Same auth.uid() check as above.

---

### 🟡 MEDIUM RISK: Read User Data

#### 3. `get_user_tier` (004_user_features.sql:137)
```sql
CREATE OR REPLACE FUNCTION get_user_tier(p_user_id uuid)
RETURNS text
SECURITY DEFINER
```

**Issue:** Anyone can check any user's subscription tier.

**Impact:** Privacy leak, potential for targeted attacks on free users.

**Fix:** Add auth check if intended for current user only, or move to private schema.

---

## Verified Secure Functions ✅

### `fetch_words_for_list_gated` and `search_word_entries_gated`
Both functions properly use `auth.uid()`:
```sql
v_user_id := auth.uid();
IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('items', '[]'::jsonb, ...);
END IF;
```

Line 287-288 in `fetch_words_for_list_gated` also checks list ownership.

---

## Additional Critical Findings

### 🔴 HIGH RISK: `get_next_word` (003_queue_training.sql:9)
**Issue:** Takes `p_user_id` parameter, no auth check.

**Attack:** Anyone can get another user's training queue:
```javascript
await supabase.rpc('get_next_word', {
  p_user_id: '<victim-uuid>',
  p_modes: ['word-to-definition']
})
```

**Impact:** Privacy leak - see what words another user is learning.

**Fix:** Add auth check at function start.

---

### 🟡 MEDIUM RISK: Stats Functions

All take `p_user_id` without auth checks:
- `get_detailed_training_stats` (003:675)
- `get_scenario_word_stats` (003:854)
- `get_scenario_stats` (003:898)

**Impact:** Can query any user's training statistics.

**Fix:** Add auth check to all.

---

## Recommended Actions

### Immediate (Critical Security Fixes)

**Migration 011 Required:**

1. **Add auth checks to write functions (HIGH PRIORITY):**
   - ❌ `handle_review` (002:189)
   - ❌ `handle_click` (002:337)

2. **Add auth checks to read functions (MEDIUM PRIORITY):**
   - ❌ `get_user_tier` (004:137)
   - ❌ `get_next_word` + overloads (003:9, 533, 552, 586)
   - ❌ `get_detailed_training_stats` (003:675)
   - ❌ `get_scenario_word_stats` (003:854)
   - ❌ `get_scenario_stats` (003:898)

3. **Already secure (verified):**
   - ✅ `fetch_words_for_list_gated` (has auth check L264)
   - ✅ `search_word_entries_gated` (has auth check L182)
   - ✅ `set_default_user_settings` (trigger function)
   - ✅ `get_training_scenarios` (static data, no user_id)

### Short-term (Security Hardening)

3. **Create private schema:**
   ```sql
   CREATE SCHEMA IF NOT EXISTS private;
   REVOKE ALL ON SCHEMA private FROM public, anon, authenticated;
   GRANT USAGE ON SCHEMA private TO postgres;
   ```

4. **Move internal functions to private:**
   - `get_last_review_debug` (debug function, not for production API)
   - Any helper functions not called by frontend

5. **Document public API:**
   - Create docs/api-functions.md
   - List all intentional RPC endpoints
   - Document parameters, auth requirements, examples

### Process Improvements

6. **Update migration guidelines:**
   - Add to db/README.md: "All SECURITY DEFINER functions must check auth.uid()"
   - Add to pre-commit hook: Check for SECURITY DEFINER without auth.uid()

---

## Next Steps

1. Read remaining functions (items 6-11) to complete audit
2. Create migration 011 with auth fixes for items 1-2
3. Create migration 012 for private schema + moves
4. Document public API contract
5. Update pre-commit hook to check SECURITY DEFINER auth

---

**Status:** ✅ Audit Complete - 9 functions need fixes
**Last Updated:** 2026-01-25

---

## Summary

**Total Functions Audited:** 12 (15 including overloads)

**Security Status:**
- 🔴 **Critical (High Risk):** 3 functions (handle_review, handle_click, get_next_word)
- 🟡 **Medium Risk:** 4 functions (get_user_tier, 3x stats functions)
- 🟢 **Secure:** 4 functions (2x gated, 1x trigger, 1x static)
- 🟡 **Debug/Internal:** 1 function (get_last_review_debug - move to private)

**Action Required:** Create migration 011 to add auth checks to 9 functions.
