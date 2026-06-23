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
    p_page_size int DEFAULT 20,
    p_language_code text DEFAULT NULL,
    p_dictionary_ids uuid[] DEFAULT NULL
) RETURNS jsonb
```

Free tier is capped; premium and admin are not. Results are filtered through `can_access_dictionary(...)`.
`p_language_code` and `p_dictionary_ids` are lookup/search scope filters; they
are independent of the user's active training scope.

Search results are ranked for dictionary lookup. Exact headword matches appear
before `word_forms` lemma/inflection matches, related/compound headwords,
example matches, definition matches, and broad fallback matches. Each returned
item may include:

- `dictionary_name`, `dictionary_slug`, `dictionary_kind`
- `search_group_rank`
- `search_match_group`
- `search_match_label`
- `search_matched_text`

The UI uses these fields to explain why a row appeared and to avoid showing
broad substring matches before exact dictionary entries.

## `get_available_learning_languages`

Return learning languages that have accessible dictionary content or
training-eligible lists for the current user.

```sql
get_available_learning_languages(
    p_user_id uuid
) RETURNS jsonb
```

Each row includes `code`, `label`, `dictionary_count`, `curated_list_count`,
`user_list_count`, and `has_training_eligible_lists`.

## `get_available_dictionary_sources`

Return readable dictionary sources for one learning language.

```sql
get_available_dictionary_sources(
    p_user_id uuid,
    p_language_code text
) RETURNS jsonb
```

Each row includes `id`, `language_code`, `slug`, `name`, `kind`, `visibility`,
`is_editable`, and `entry_count`.

## `get_active_training_scope`

Read the saved active training scope for one learning language.

```sql
get_active_training_scope(
    p_user_id uuid,
    p_language_code text
) RETURNS jsonb
```

The scope includes `language_code`, `active_list_id`, `active_list_type`,
`active_scenario`, `card_filter`, `modes_enabled`, `new_review_ratio`,
`has_saved_scope`, and `is_valid`. If the saved list is no longer accessible for
that language, the RPC clears the invalid list reference.

## `update_active_training_scope`

Persist the active training scope for one learning language.

```sql
update_active_training_scope(
    p_user_id uuid,
    p_language_code text,
    p_list_id uuid DEFAULT NULL,
    p_list_type text DEFAULT NULL,
    p_active_scenario text DEFAULT NULL,
    p_card_filter text DEFAULT NULL,
    p_modes_enabled text[] DEFAULT NULL,
    p_new_review_ratio int DEFAULT NULL
) RETURNS jsonb
```

The legacy `get_active_word_list` and `update_active_word_list` RPCs remain as
compatibility wrappers over the default language in `user_settings.language_code`.

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

The RPC tries exact headword, lowercase headword, then `word_forms`. It returns
a JSON array of all accessible candidates for the resolved headword, ordered
with user-owned entries first, then curated entries. Each candidate includes
entry metadata, `meaning_id`, `meanings_count`, and lightweight user status if
present. It does not write FSRS state, list membership, or review logs.

## HTTP `POST /api/platform/lookup`

Read-only lookup endpoint for external clients and first-party integrations.
When the same headword exists in VanDale and a private user dictionary, both
accessible candidates are returned in `items`.

Authentication:
- Requires `Authorization: Bearer <supabase-access-token>`.
- Uses the anon key plus the caller's JWT, so Supabase RLS/RPC auth context remains the caller.
- Browser clients may use CORS if their `Origin` is listed in `PLATFORM_API_ALLOWED_ORIGINS` as a comma-separated allowlist. `*` is supported for non-cookie Bearer-token clients.

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
      "listMemberships": [
        {
          "id": "list-uuid",
          "kind": "user",
          "name": "My words",
          "description": null,
          "primaryLanguageCode": "nl",
          "defaultScenarioId": "understanding",
          "cardPolicy": "restrict",
          "cardTypeIds": ["word-to-definition"],
          "itemCount": 12
        }
      ],
      "availableActions": [
        "record-view",
        "start-learning",
        "mark-known",
        "mark-unknown",
        "review-card",
        "add-to-list",
        "copy-to-user-dictionary",
        "create-user-entry",
        "update-user-entry",
        "delete-user-entry"
      ]
    }
  ]
}
```

When `includeUserState` is `false`, the endpoint skips both card state and
user-list membership reads. In either mode it remains read-only.

This endpoint is read-only. Use `/api/platform/actions` for mutations.

## HTTP `POST /api/platform/actions`

Explicit mutation endpoint. Plain lookup must not call this endpoint implicitly.

Authentication is the same Bearer-token flow as `/api/platform/lookup`.

Supported actions:
- `record-view` – calls `record_card_view`.
- `start-learning` – calls `start_learning_entry_card`, enabling the card without
  writing a review-log row.
- `mark-known` – explicit shortcut to `handle_card_review(..., "easy")`.
- `review-card` – calls `handle_card_review` with the supplied result and optional `turnId`.
- `mark-unknown` – explicit shortcut to `handle_card_review(..., "fail")`.
- `add-to-list` – calls `add_entry_to_user_list` for an owned user list.
- `remove-from-list` – calls `remove_entries_from_user_list` for an owned user
  list.
- `copy-to-user-dictionary` – calls `copy_entry_to_user_dictionary`, creating
  or using a private editable `user-entry-v1` dictionary.
- `create-user-entry` – calls `create_user_dictionary_entry` with a full
  `user-entry-v1` payload.
- `POST /api/platform/v1/user-dictionary/generated-entry` – builds a
  generated `user-entry-v1` payload with `generation` metadata and persists it
  through `create_user_dictionary_entry`. It requires `platform:write`, stores
  the row in the user's private editable dictionary, and leaves learning state
  untouched until an explicit `start-learning` action.
- `update-user-entry` – calls `update_user_dictionary_entry` and replaces an
  owned user entry payload.
- `delete-user-entry` – calls `delete_user_dictionary_entry` for an owned user
  entry.
- `create-user-list` – calls `create_user_word_list`.
- `update-user-list` – calls `update_user_word_list`.
- `delete-user-list` – calls `delete_user_word_list`.

User-list create/update actions may include training intent metadata:

- `defaultScenarioId`: optional scenario id such as `understanding` or
  `listening`.
- `cardPolicy`: `inherit`, `prefer`, or `restrict`.
- `cardTypeIds`: optional card-type id array. Lists still contain entries; this
  field describes how training should project those entries into cards.

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

```json
{
  "action": "remove-from-list",
  "entryId": "entry-uuid",
  "listId": "list-uuid"
}
```

```json
{
  "action": "copy-to-user-dictionary",
  "entryId": "entry-uuid",
  "overrides": {
    "translation": {
      "languageCode": "ru",
      "text": "дом"
    },
    "notes": "Preferred personal wording"
  }
}
```

```json
{
  "action": "create-user-entry",
  "entry": {
    "headword": "gedoe",
    "languageCode": "nl",
    "translation": {
      "languageCode": "en",
      "text": "hassle"
    },
    "example": {
      "source": "Wat een gedoe."
    }
  }
}
```

```json
{
  "action": "update-user-entry",
  "entryId": "entry-uuid",
  "entry": {
    "headword": "gedoe",
    "languageCode": "nl",
    "definition": "updated personal definition"
  }
}
```

```json
{
  "action": "create-user-list",
  "name": "Film words",
  "description": "Words collected while watching",
  "languageCode": "nl",
  "primaryLanguageCode": "nl",
  "defaultScenarioId": "understanding",
  "cardPolicy": "restrict",
  "cardTypeIds": ["word-to-definition"]
}
```

```json
{
  "action": "update-user-list",
  "listId": "list-uuid",
  "name": "Updated film words",
  "description": null,
  "languageCode": "nl",
  "primaryLanguageCode": "nl",
  "defaultScenarioId": "listening",
  "cardPolicy": "restrict",
  "cardTypeIds": ["listen-recognize"]
}
```

```json
{
  "action": "delete-user-list",
  "listId": "list-uuid"
}
```

```json
{
  "action": "delete-user-entry",
  "entryId": "entry-uuid"
}
```

## HTTP `POST /api/platform/analyze-selection`

Composite endpoint for browser extensions and adjacent apps that want one
round trip. It runs lookup first and is read-only unless the request includes
an explicit `actions` array.

Request:

```json
{
  "selection": "huis",
  "includeUserState": true,
  "actions": [
    {
      "action": "start-learning",
      "entryId": "entry-uuid",
      "cardTypeId": "word-to-definition"
    }
  ]
}
```

Response:

```json
{
  "lookup": {
    "query": "huis",
    "items": []
  },
  "actionResults": [
    {
      "status": 200,
      "body": {
        "ok": true
      }
    }
  ]
}
```
