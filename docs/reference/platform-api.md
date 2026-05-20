# Platform HTTP API

**Versioned base path:** `/api/platform/v1`

The current unversioned `/api/platform/*` routes remain as aliases for local app usage and transition clients. Versioned response shapes are covered by snapshot tests in `apps/ui/tests/api/platformV1Routes.test.ts`.

These routes are the external client boundary for browser extensions and other companion apps. They use bearer Supabase user tokens and keep ordinary lookup read-only.

Smoke check:
```bash
cd apps/ui
npm run test:platform
```

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
        "learningCardCount": 0,
        "hiddenCardCount": 0,
        "strongestCardTypeId": "word-to-definition",
        "weakestCardTypeId": "word-to-definition",
        "lastReviewedAt": "2026-05-17T11:00:00.000Z",
        "nextReviewAt": "2026-05-18T11:00:00.000Z"
      },
      "listMemberships": [],
      "availableActions": [
        "record-view",
        "start-learning",
        "mark-known",
        "mark-unknown",
        "review-card",
        "add-to-list",
        "remove-from-list",
        "copy-to-user-dictionary",
        "create-user-entry"
      ]
    }
  ]
}
```

`includeUserState: false` omits `userStateByCardType`, `progressSummary`, and `listMemberships`. This endpoint must not call review/list mutation RPCs. Progress `status` is one of `new`, `seen`, `mixed`, `learning`, `reviewing`, or `hidden`; hidden cards are not reported as known.

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

Read-only convenience endpoint for text-selection clients. It runs lookup using `selection` or `query` and always returns an empty `actionResults` array for shape compatibility. Mutations must go through `POST /actions`.

Request:
```json
{
  "selection": "huis",
  "includeUserState": true
}
```

Response:
```json
{
  "lookup": {
    "query": "huis",
    "items": []
  },
  "actionResults": []
}
```

If an `actions` field is provided and is not an empty array, the route returns `400` with `error: "analyze_selection_is_read_only"` and `actionsEndpoint: "/api/platform/actions"`.
