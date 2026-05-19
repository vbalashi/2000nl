# API Functions: Training And Queue

## Authentication

Use authenticated Supabase clients:

```javascript
const { data, error } = await supabase.rpc('function_name', { params });
```

Functions in this group validate that `p_user_id` matches `auth.uid()`.

## `get_next_card`

Get the next card for training. The current fresh-deploy function accepts explicit card modes; callers that work from a scenario must resolve that scenario to its `card_modes` first.

```sql
get_next_card(
    p_user_id uuid,
    p_card_type_ids text[] DEFAULT ARRAY['word-to-definition'],
    p_exclude_entry_ids uuid[] DEFAULT ARRAY[]::uuid[],
    p_list_id uuid DEFAULT NULL,
    p_list_type text DEFAULT 'curated',
    p_card_filter text DEFAULT 'both',
    p_queue_turn text DEFAULT 'auto',
    p_exclude_card_keys text[] DEFAULT ARRAY[]::text[]
) RETURNS SETOF jsonb
```

Parameters:
- `p_user_id`
- `p_card_type_ids`
- `p_exclude_entry_ids`
- `p_list_id`
- `p_list_type`
- `p_card_filter`
- `p_queue_turn`
- `p_exclude_card_keys` – session exclusion by card identity using `entry_id:mode`, so another mode for the same entry can still be selected.

Example:
```javascript
const { data: cards } = await supabase.rpc('get_next_card', {
  p_user_id: user.id,
  p_card_type_ids: ['word-to-definition'],
  p_exclude_entry_ids: [],
  p_exclude_card_keys: [],
  p_card_filter: 'both'
});
```

Notes:
- Legacy `get_next_word` overloads are dropped after migration `053_get_next_card_primary.sql`.
- Selection is filtered through `can_access_dictionary(...)`; inaccessible private dictionaries are not schedulable.
