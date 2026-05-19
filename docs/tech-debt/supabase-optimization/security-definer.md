# Supabase Optimization: Security Definer Audit

## Priority 2: Security Definer Audit

### Task 2.1: Audit All SECURITY DEFINER Functions

Audit fields:
- Function name
- File and line
- Uses `auth.uid()`
- Has proper auth checks
- Intended for API
- Recommended action

Audit targets:
- High priority: `handle_card_review`, `record_card_view`, `start_learning_entry_card`
- Medium priority: `fetch_words_for_list_gated`, `search_word_entries_gated`, `set_default_user_settings`, `get_user_tier`
- Lower priority: `get_next_card`, `get_training_scenarios`, `get_detailed_training_stats`, `get_scenario_stats`, `get_scenario_word_stats`, `get_last_review_debug`

### Task 2.2: Create Private Schema For Internal Functions
- Create `010_private_schema.sql`
- Create `private` schema
- Move internal-only functions there
- Revoke access from `anon` and `authenticated`

### Task 2.3: Keep Public API Contract Documented
- Maintain [docs/reference/api-functions.md](../../reference/api-functions.md)
- Keep parameters, return values, and auth notes current

## Audit Outcome Snapshot

- 12 SECURITY DEFINER functions reviewed
- 9 functions needed auth checks
- 3 were already secure

## Fixes Applied

- Auth checks for `handle_card_review`, `record_card_view`, `start_learning_entry_card`, `get_user_tier`, and related public RPCs are captured in the current consolidated migrations
- Scheduler auth checks are covered by `get_next_card`

## Open Follow-Up

- Decide which remaining debug helpers belong in `private`
- Confirm the public RPC surface still matches current frontend usage
