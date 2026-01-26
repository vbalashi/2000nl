# Public API Functions

**Last Updated:** 2026-01-25
**API Base:** `https://<project-ref>.supabase.co/rest/v1/rpc/`

All functions in the `public` schema are automatically exposed via PostgREST at:
```
POST /rest/v1/rpc/<function_name>
```

---

## Authentication

All functions require authentication via Supabase auth. Pass the user's JWT token:

```javascript
const { data, error } = await supabase.rpc('function_name', { params });
```

Functions verify `auth.uid()` matches the `p_user_id` parameter.

---

## Training & Queue Functions

### `get_next_word`

Get the next card for training (queue-based selection).

**Signature:**
```sql
get_next_word(
    p_user_id uuid,
    p_modes text[] DEFAULT ARRAY['word-to-definition'],
    p_exclude_ids uuid[] DEFAULT ARRAY[]::uuid[],
    p_list_id uuid DEFAULT NULL,
    p_list_type text DEFAULT 'curated',
    p_card_filter text DEFAULT 'both',
    p_queue_turn text DEFAULT 'auto'
) RETURNS SETOF jsonb
```

**Parameters:**
- `p_user_id` - User UUID (must match `auth.uid()`)
- `p_modes` - Array of card modes to include
- `p_exclude_ids` - Array of word IDs to exclude (already seen)
- `p_list_id` - Optional: Filter to specific list
- `p_list_type` - `'curated'` or `'user'`
- `p_card_filter` - `'new'`, `'review'`, or `'both'`
- `p_queue_turn` - `'new'`, `'review'`, or `'auto'`

**Returns:** Array of card objects with word data

**Example:**
```javascript
const { data: cards } = await supabase.rpc('get_next_word', {
  p_user_id: user.id,
  p_modes: ['word-to-definition'],
  p_exclude_ids: [],
  p_card_filter: 'both'
});
```

**Auth:** ✅ Checks `p_user_id` matches `auth.uid()`

---

### `get_next_word` (scenario variant)

Get next card filtered by scenario.

**Signature:**
```sql
get_next_word(
    p_user_id uuid,
    p_scenario_id text,
    p_exclude_ids uuid[] DEFAULT ARRAY[]::uuid[],
    p_list_id uuid DEFAULT NULL,
    p_list_type text DEFAULT 'curated',
    p_card_filter text DEFAULT 'both',
    p_queue_turn text DEFAULT 'auto'
) RETURNS SETOF jsonb
```

**Parameters:**
- `p_scenario_id` - Scenario ID (e.g., `'understanding'`, `'production'`)
- Other parameters same as main `get_next_word`

**Returns:** Array of card objects

**Example:**
```javascript
const { data: cards } = await supabase.rpc('get_next_word', {
  p_user_id: user.id,
  p_scenario_id: 'understanding',
  p_exclude_ids: []
});
```

**Auth:** ✅ Checks `p_user_id` matches `auth.uid()`

---

## Review Functions

### `handle_review`

Record a graded review (success, fail, hard, easy).

**Signature:**
```sql
handle_review(
    p_user_id uuid,
    p_word_id uuid,
    p_mode text,
    p_result text
) RETURNS void
```

**Parameters:**
- `p_user_id` - User UUID (must match `auth.uid()`)
- `p_word_id` - Word being reviewed
- `p_mode` - Card mode (e.g., `'word-to-definition'`)
- `p_result` - Grade: `'success'`, `'fail'`, `'hard'`, `'easy'`, `'hide'`, `'freeze'`

**Side Effects:**
- Updates `user_word_status` (FSRS state)
- Inserts into `user_review_log`
- Inserts into `user_events`

**Example:**
```javascript
await supabase.rpc('handle_review', {
  p_user_id: user.id,
  p_word_id: wordId,
  p_mode: 'word-to-definition',
  p_result: 'success'
});
```

**Auth:** ✅ Checks `p_user_id` matches `auth.uid()`

---

### `handle_click`

Record a "show answer" click (lapse in FSRS).

**Signature:**
```sql
handle_click(
    p_user_id uuid,
    p_word_id uuid,
    p_mode text
) RETURNS void
```

**Parameters:**
- `p_user_id` - User UUID (must match `auth.uid()`)
- `p_word_id` - Word being clicked
- `p_mode` - Card mode

**Side Effects:**
- Updates `user_word_status` (treats as grade=0)
- Inserts into `user_review_log` (review_type='click')
- Inserts into `user_events` (event_type='definition_click')
- Increments `click_count`

**Example:**
```javascript
await supabase.rpc('handle_click', {
  p_user_id: user.id,
  p_word_id: wordId,
  p_mode: 'word-to-definition'
});
```

**Auth:** ✅ Checks `p_user_id` matches `auth.uid()`

---

## Statistics Functions

### `get_detailed_training_stats`

Get detailed training statistics for session footer.

**Signature:**
```sql
get_detailed_training_stats(
    p_user_id uuid,
    p_modes text[] DEFAULT NULL,
    p_list_id uuid DEFAULT NULL,
    p_list_type text DEFAULT 'curated'
) RETURNS jsonb
```

**Parameters:**
- `p_user_id` - User UUID (must match `auth.uid()`)
- `p_modes` - Optional: Filter by card modes
- `p_list_id` - Optional: Filter by list
- `p_list_type` - `'curated'` or `'user'`

**Returns:**
```json
{
  "new_today": 5,
  "new_remaining": 45,
  "learning_due": 12,
  "review_due": 8,
  "total_cards": 1000
}
```

**Example:**
```javascript
const { data: stats } = await supabase.rpc('get_detailed_training_stats', {
  p_user_id: user.id,
  p_modes: ['word-to-definition']
});
```

**Auth:** ✅ Checks `p_user_id` matches `auth.uid()`

---

### `get_scenario_word_stats`

Get FSRS stats for a specific word in a scenario.

**Signature:**
```sql
get_scenario_word_stats(
    p_user_id uuid,
    p_word_id uuid,
    p_scenario_id text
) RETURNS jsonb
```

**Parameters:**
- `p_user_id` - User UUID (must match `auth.uid()`)
- `p_word_id` - Word to check
- `p_scenario_id` - Scenario ID

**Returns:**
```json
{
  "min_stability": 2.5,
  "avg_stability": 5.2,
  "max_stability": 8.0,
  "cards_started": 3,
  "cards_total": 4,
  "is_learned": false
}
```

**Example:**
```javascript
const { data: stats } = await supabase.rpc('get_scenario_word_stats', {
  p_user_id: user.id,
  p_word_id: wordId,
  p_scenario_id: 'understanding'
});
```

**Auth:** ✅ Checks `p_user_id` matches `auth.uid()`

---

### `get_scenario_stats`

Get aggregate stats for all words in a scenario.

**Signature:**
```sql
get_scenario_stats(
    p_user_id uuid,
    p_scenario_id text,
    p_list_id uuid DEFAULT NULL,
    p_list_type text DEFAULT 'curated'
) RETURNS jsonb
```

**Parameters:**
- `p_user_id` - User UUID (must match `auth.uid()`)
- `p_scenario_id` - Scenario ID
- `p_list_id` - Optional: Filter by list
- `p_list_type` - `'curated'` or `'user'`

**Returns:**
```json
{
  "total": 1000,
  "learned": 250,
  "in_progress": 150,
  "new": 600
}
```

**Example:**
```javascript
const { data: stats } = await supabase.rpc('get_scenario_stats', {
  p_user_id: user.id,
  p_scenario_id: 'understanding',
  p_list_id: listId
});
```

**Auth:** ✅ Checks `p_user_id` matches `auth.uid()`

---

### `get_training_scenarios`

Get list of available training scenarios (static data).

**Signature:**
```sql
get_training_scenarios() RETURNS SETOF jsonb
```

**Parameters:** None

**Returns:** Array of scenario objects:
```json
[
  {
    "id": "understanding",
    "name": "Understanding",
    "description": "...",
    "card_modes": ["word-to-definition", "..."],
    "graduation_threshold": 21.0,
    "enabled": true
  }
]
```

**Example:**
```javascript
const { data: scenarios } = await supabase.rpc('get_training_scenarios');
```

**Auth:** ⚠️ No auth check (static data, no user_id parameter)

---

## User Functions

### `get_user_tier`

Get user's subscription tier.

**Signature:**
```sql
get_user_tier(p_user_id uuid) RETURNS text
```

**Parameters:**
- `p_user_id` - User UUID (must match `auth.uid()`)

**Returns:** `'free'`, `'premium'`, or `'admin'`

**Example:**
```javascript
const { data: tier } = await supabase.rpc('get_user_tier', {
  p_user_id: user.id
});
```

**Auth:** ✅ Checks `p_user_id` matches `auth.uid()`

---

## Search & List Functions

### `search_word_entries_gated`

Search word dictionary with tier-based gating.

**Signature:**
```sql
search_word_entries_gated(
    p_query text DEFAULT NULL,
    p_part_of_speech text DEFAULT NULL,
    p_is_nt2 boolean DEFAULT NULL,
    p_filter_frozen boolean DEFAULT NULL,
    p_filter_hidden boolean DEFAULT NULL,
    p_page int DEFAULT 1,
    p_page_size int DEFAULT 20
) RETURNS jsonb
```

**Parameters:**
- `p_query` - Search query (headword)
- `p_part_of_speech` - Filter by POS
- `p_is_nt2` - Filter by NT2-2000 list
- `p_filter_frozen` - Show only frozen cards
- `p_filter_hidden` - Show only hidden cards
- `p_page` - Page number (1-based)
- `p_page_size` - Results per page

**Returns:**
```json
{
  "items": [...],
  "total": 1234,
  "is_locked": false,
  "max_allowed": null
}
```

**Gating:**
- Free tier: max 100 results
- Premium/admin: unlimited

**Example:**
```javascript
const { data } = await supabase.rpc('search_word_entries_gated', {
  p_query: 'huis',
  p_page: 1,
  p_page_size: 20
});
```

**Auth:** ✅ Uses `auth.uid()` internally

---

### `fetch_words_for_list_gated`

Fetch words from a specific list with tier-based gating.

**Signature:**
```sql
fetch_words_for_list_gated(
    p_list_id uuid,
    p_list_type text DEFAULT 'curated',
    p_query text DEFAULT NULL,
    p_part_of_speech text DEFAULT NULL,
    p_is_nt2 boolean DEFAULT NULL,
    p_filter_frozen boolean DEFAULT NULL,
    p_filter_hidden boolean DEFAULT NULL,
    p_page int DEFAULT 1,
    p_page_size int DEFAULT 20
) RETURNS jsonb
```

**Parameters:**
- `p_list_id` - List UUID
- `p_list_type` - `'curated'` or `'user'`
- Other parameters same as `search_word_entries_gated`

**Returns:**
```json
{
  "items": [...],
  "total": 500,
  "is_locked": false,
  "max_allowed": null
}
```

**Gating:**
- Free tier: max 100 results per list
- Premium/admin: unlimited
- User lists: checks ownership

**Example:**
```javascript
const { data } = await supabase.rpc('fetch_words_for_list_gated', {
  p_list_id: listId,
  p_list_type: 'curated',
  p_page: 1
});
```

**Auth:** ✅ Uses `auth.uid()` internally + checks list ownership for user lists

---

## Internal Functions (Not in API)

These functions are in the `private` schema and **not accessible via PostgREST**:

### `private.get_last_review_debug`

Debug function to inspect last review log entry.

**Location:** `private` schema
**Accessible via API:** ❌ No
**Use case:** Debugging, diagnostics

---

## Security Notes

### Authorization Pattern

All public API functions follow this pattern:

```sql
BEGIN
    -- Verify caller owns this user_id
    IF p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
    END IF;

    -- Function logic...
END;
```

### Functions Without user_id Parameter

Functions that don't take `p_user_id` use `auth.uid()` internally:
- `search_word_entries_gated` - Uses `auth.uid()` at line 182
- `fetch_words_for_list_gated` - Uses `auth.uid()` at line 264

### Static Data Functions

Functions returning static data (no user isolation needed):
- `get_training_scenarios` - Returns scenario definitions

### Trigger Functions

Functions called by database triggers (not via API):
- `set_default_user_settings` - Called on user signup

---

## Migration History

**Security Fixes:**
- **2026-01-25 (Migration 011):** Added auth checks to 9 functions
  - handle_review, handle_click (HIGH RISK)
  - get_next_word, get_user_tier (MEDIUM RISK)
  - 3x stats functions (MEDIUM RISK)

**Schema Changes:**
- **2026-01-25 (Migration 012):** Created `private` schema
  - Moved `get_last_review_debug` to private

---

## Testing API Calls

### Authenticated Request
```javascript
const supabase = createClient(url, key);
await supabase.auth.signIn({ email, password });

const { data, error } = await supabase.rpc('get_next_word', {
  p_user_id: supabase.auth.user().id,
  p_modes: ['word-to-definition']
});
```

### Authorization Errors
```javascript
// This will fail with "unauthorized" error:
await supabase.rpc('handle_review', {
  p_user_id: '<some-other-user-uuid>',  // ❌ Not your user_id
  p_word_id: wordId,
  p_mode: 'word-to-definition',
  p_result: 'success'
});
```

---

## Related Documentation

- [Database README](../db/README.md) - Migration workflow
- [Security Audit](../reports/security-definer-audit.md) - Security findings
- [TODO](./TODO-supabase-optimization.md) - Optimization roadmap
