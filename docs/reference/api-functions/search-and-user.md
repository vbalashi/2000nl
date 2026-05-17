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

Free tier is capped; premium and admin are not. Results are filtered through `can_access_dictionary(...)`.

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

For user lists, ownership is checked. Returned entries are filtered through `can_access_dictionary(...)`.

## `fetch_dictionary_entry_gated`

Read-only dictionary lookup for authenticated users.

```sql
fetch_dictionary_entry_gated(
    p_headword text
) RETURNS jsonb
```

The RPC tries exact headword, lowercase headword, then `word_forms`. It returns entry metadata, `meanings_count`, and lightweight user status if present. It does not write FSRS state, list membership, or review logs.

## HTTP `POST /api/platform/lookup`

Read-only lookup endpoint for external clients and first-party integrations.

Authentication:
- Requires `Authorization: Bearer <supabase-access-token>`.
- Uses the anon key plus the caller's JWT, so Supabase RLS/RPC auth context remains the caller.

Request:

```json
{
  "query": "huis",
  "includeUserState": true
}
```

Response:

```json
{
  "query": "huis",
  "items": [
    {
      "entry": {},
      "dictionary": {},
      "userStateByCardType": {},
      "availableActions": [
        "record-view",
        "start-learning",
        "mark-unknown",
        "review-card",
        "add-to-list"
      ]
    }
  ]
}
```

This endpoint is read-only. Use `/api/platform/actions` for mutations.

## HTTP `POST /api/platform/actions`

Explicit mutation endpoint. Plain lookup must not call this endpoint implicitly.

Authentication is the same Bearer-token flow as `/api/platform/lookup`.

Supported actions:
- `record-view` – calls `record_word_view`.
- `start-learning` – currently records an explicit view/start marker via `record_word_view`.
- `review-card` – calls `handle_review` with the supplied result and optional `turnId`.
- `mark-unknown` – explicit shortcut to `handle_review(..., "fail")`.
- `add-to-list` – inserts the entry into an owned user list.

Examples:

```json
{
  "action": "review-card",
  "entryId": "entry-uuid",
  "cardTypeId": "word-to-definition",
  "result": "success",
  "turnId": "review-turn-uuid"
}
```

```json
{
  "action": "add-to-list",
  "entryId": "entry-uuid",
  "listId": "list-uuid"
}
```
