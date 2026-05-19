# Platform HTTP API

**Base path:** `/api/platform`

These routes are the external client boundary for browser extensions and other companion apps. They use bearer Supabase user tokens and keep ordinary lookup read-only.

## Auth And CORS

- Send `Authorization: Bearer <supabase-user-access-token>`.
- Configure allowed browser/extension origins with `PLATFORM_API_ALLOWED_ORIGINS`.
- Routes respond to `OPTIONS` preflight with the configured CORS headers.

## `POST /lookup`

Read-only dictionary lookup.

Request:
```json
{
  "query": "huis",
  "includeUserState": true
}
```

Response shape:
```json
{
  "query": "huis",
  "items": [
    {
      "entry": {
        "id": "entry-id",
        "dictionaryId": "dictionary-id",
        "languageCode": "nl",
        "headword": "huis",
        "meaningId": 1,
        "raw": {}
      },
      "dictionary": {
        "id": "dictionary-id",
        "slug": "nl-vandale",
        "kind": "curated",
        "schemaKey": "nl-vandale-v1",
        "schemaVersion": 1
      },
      "userStateByCardType": {
        "word-to-definition": {
          "entryId": "entry-id",
          "cardTypeId": "word-to-definition",
          "seenCount": 4,
          "successCount": 1,
          "fsrs": {
            "reps": 1,
            "lapses": 0,
            "paramsVersion": "fsrs-6-default"
          }
        }
      },
      "progressSummary": {
        "status": "reviewing",
        "trackedCardCount": 1,
        "reviewedCardCount": 1,
        "strongestCardTypeId": "word-to-definition",
        "weakestCardTypeId": "word-to-definition"
      },
      "listMemberships": [],
      "availableActions": ["record-view", "start-learning", "review-card"]
    }
  ]
}
```

`includeUserState: false` omits `userStateByCardType`, `progressSummary`, and `listMemberships`. This endpoint must not call review/list mutation RPCs.

## `POST /actions`

Explicit mutation endpoint. Supported action IDs are defined in `packages/shared/types/platform.ts`.

Examples:
```json
{
  "action": "start-learning",
  "entryId": "entry-id",
  "cardTypeId": "word-to-definition"
}
```

```json
{
  "action": "review-card",
  "entryId": "entry-id",
  "cardTypeId": "definition-to-word",
  "result": "success",
  "turnId": "client-generated-uuid"
}
```

## `POST /analyze-selection`

Composite convenience endpoint for text-selection clients. It runs lookup first and executes mutations only when an explicit `actions` array is present.

Request:
```json
{
  "selection": "huis",
  "includeUserState": true,
  "actions": [
    {
      "action": "start-learning",
      "entryId": "entry-id",
      "cardTypeId": "word-to-definition"
    }
  ]
}
```
