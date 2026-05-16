# API Functions: Search, Lists, And User

## `get_user_tier`

Get the user's subscription tier.

```sql
get_user_tier(p_user_id uuid) RETURNS text
```

## `search_word_entries_gated`

Search the dictionary with tier-based gating.

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

Free tier is capped; premium and admin are not.

## `fetch_words_for_list_gated`

Fetch words from a specific list with tier-based gating.

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

For user lists, ownership is checked.
