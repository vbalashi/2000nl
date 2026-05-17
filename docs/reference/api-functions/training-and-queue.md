# API Functions: Training And Queue

## Authentication

Use authenticated Supabase clients:

```javascript
const { data, error } = await supabase.rpc('function_name', { params });
```

Functions in this group validate that `p_user_id` matches `auth.uid()`.

## `get_next_word`

Get the next card for training. The current fresh-deploy function accepts explicit card modes; callers that work from a scenario must resolve that scenario to its `card_modes` first.

```sql
get_next_word(
    p_user_id uuid,
    p_modes text[] DEFAULT ARRAY['word-to-definition'],
    p_exclude_ids uuid[] DEFAULT ARRAY[]::uuid[],
    p_list_id uuid DEFAULT NULL,
    p_list_type text DEFAULT 'curated',
    p_card_filter text DEFAULT 'both',
    p_queue_turn text DEFAULT 'auto',
    p_exclude_card_keys text[] DEFAULT ARRAY[]::text[]
) RETURNS SETOF jsonb
```

Parameters:
- `p_user_id`
- `p_modes`
- `p_exclude_ids`
- `p_list_id`
- `p_list_type`
- `p_card_filter`
- `p_queue_turn`
- `p_exclude_card_keys` – session exclusion by card identity using `entry_id:mode`, so another mode for the same entry can still be selected.

Example:
```javascript
const { data: cards } = await supabase.rpc('get_next_word', {
  p_user_id: user.id,
  p_modes: ['word-to-definition'],
  p_exclude_ids: [],
  p_exclude_card_keys: [],
  p_card_filter: 'both'
});
```

Notes:
- `db/migrations/003_queue_training.sql` also keeps a backward-compatible single-mode overload: `get_next_word(p_user_id uuid, p_mode text, p_exclude_ids uuid[], p_list_id uuid, p_list_type text)`.
- A scenario-based overload was removed from the consolidated migration because it collided with the single-mode overload during Postgres function resolution.
- Selection is filtered through `can_access_dictionary(...)`; inaccessible private dictionaries are not schedulable.
