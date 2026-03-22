# API Functions: Training And Queue

## Authentication

Use authenticated Supabase clients:

```javascript
const { data, error } = await supabase.rpc('function_name', { params });
```

Functions in this group validate that `p_user_id` matches `auth.uid()`.

## `get_next_word`

Get the next card for training.

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

Parameters:
- `p_user_id`
- `p_modes`
- `p_exclude_ids`
- `p_list_id`
- `p_list_type`
- `p_card_filter`
- `p_queue_turn`

Example:
```javascript
const { data: cards } = await supabase.rpc('get_next_word', {
  p_user_id: user.id,
  p_modes: ['word-to-definition'],
  p_exclude_ids: [],
  p_card_filter: 'both'
});
```

## `get_next_word` Scenario Variant

Get the next card filtered by scenario.

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

Example:
```javascript
const { data: cards } = await supabase.rpc('get_next_word', {
  p_user_id: user.id,
  p_scenario_id: 'understanding',
  p_exclude_ids: []
});
```
