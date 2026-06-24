# Platform HTTP API

**Versioned base path:** `/api/platform/v1`

The current unversioned `/api/platform/*` routes remain as aliases for local app usage and transition clients. Versioned response shapes are covered by snapshot tests in `apps/ui/tests/api/platformV1Routes.test.ts`.

These routes are the external client boundary for browser extensions and other companion apps. Connected Clients should obtain bearer tokens through [2000NL Connect](./connect-api.md) and keep ordinary lookup read-only.

Smoke check:
```bash
cd apps/ui
npm run test:platform
```

For live catalog lookup/search smoke commands and token lookup rules, use
[Dictionary Platform Smoke](../runbooks/dictionary-platform-smoke.md).

## Auth And CORS

- Send `Authorization: Bearer <access_token>`.
- Connected Clients obtain `access_token` values from [2000NL Connect](./connect-api.md). Treat the token as opaque and refresh only through `/api/connect/token`.
- Every authenticated Platform request resolves to a server-derived
  `PlatformPrincipal`. First-party Supabase sessions resolve as `first_party`;
  Connected Client sessions resolve as `connected_client` with a server-tracked
  `client_id`, session id, and granted scopes.
- Connected Clients must have `platform:read` for read-oriented endpoints and
  `platform:write` for mutation endpoints. `offline_access` is only for refresh
  issuance and never grants Platform read or write access.
- Connected Client identity is never derived from CORS origin, `Referer`,
  request JSON, or `sourceContext.client.id`.
- Guest/public catalog lookup and search use a separate catalog credential:
  `Authorization: Bearer <PLATFORM_CATALOG_ACCESS_TOKEN>` against
  `/api/platform/v1/catalog/lookup` and `/api/platform/v1/catalog/search`. Do
  not use a shared end-user token for guest lookup/search.
- In production this credential is configured on the 2000NL host as
  `PLATFORM_CATALOG_ACCESS_TOKEN`. AudioFilms consumes the same value as
  `DICTIONARY_2000NL_CATALOG_ACCESS_TOKEN`.
- Configure allowed browser/extension origins with `PLATFORM_API_ALLOWED_ORIGINS`.
- Routes respond to `OPTIONS` preflight with the configured CORS headers.

## `GET /session`

Read-only session and preference endpoint for connected clients. External
clients must use this endpoint instead of reading `user_settings` directly.

Response:
```json
{
  "user": {
    "id": "user-id",
    "email": "user@example.com"
  },
  "preferences": {
    "translationTargetLanguageCode": "en",
    "source": "user-setting",
    "updatedAt": "2026-06-18T08:00:00.000Z"
  }
}
```

`translationTargetLanguageCode` is resolved from `user_settings.translation_lang`.
Unset or missing settings default to `en`; explicit `off` is returned as `null`
for clients that need to disable translation affordances. `source` is
`user-setting` when `user_settings.translation_lang` is explicitly set,
including `off`; otherwise it is `platform-default`.

## `POST /lookup`

Read-only strict dictionary lookup.

Request:
```json
{
  "query": "huis",
  "languageCode": "nl",
  "contextText": "optional surrounding text",
  "intent": "external-click",
  "includeUserState": true,
  "includeTranslations": true
}
```

Response shape:
```json
{
  "query": "huis",
  "request": {
    "languageCode": "nl",
    "contextText": "optional surrounding text",
    "intent": "external-click"
  },
  "items": [
    {
      "entry": {
        "id": "entry-id",
        "dictionaryId": "dictionary-id",
        "languageCode": "nl",
        "headword": "huis",
        "meaningId": 1,
        "content": {
          "headword": "huis",
          "headwordTranslation": "house",
          "languageCode": "nl",
          "meaningId": 1,
          "partOfSpeech": "zn",
          "gender": "het",
          "meanings": [
            {
              "definition": "gebouw",
              "context": null,
              "translations": {}
            }
          ],
          "summary": {
            "definition": "gebouw",
            "definitionTranslation": "building"
          },
          "sections": [
            {
              "id": "meaning-1",
              "sourcePath": "raw.meanings[0].definition",
              "kind": "meaning",
              "text": "gebouw",
              "translation": "building"
            }
          ],
          "translation": {
            "status": "ready",
            "targetLanguageCode": "en",
            "translationId": "translation-row-id"
          },
          "sourceMeta": {}
        },
        "contentFingerprint": "sha256-of-learner-visible-content",
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
      "cardCapabilitiesByType": {
        "word-to-definition": {
          "phase": "reviewing",
          "actions": [
            "review-card"
          ],
          "reviewResults": ["fail", "hard", "success", "easy"],
          "frozenUntil": null
        }
      },
      "translation": {
        "status": "ready",
        "targetLanguageCode": "en",
        "translationId": "translation-row-id"
      },
      "match": {
        "queriedForm": "huis",
        "matchedForm": "huis",
        "relation": "exact"
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

`includeUserState: false` omits `userStateByCardType`, `progressSummary`, and `listMemberships`. `includeTranslations: true` asks lookup to attach cached provider-backed translations to the normalized content projection; it does not trigger provider generation. This endpoint must not call review/list mutation RPCs. Progress `status` is one of `new`, `seen`, `mixed`, `learning`, `reviewing`, or `hidden`; hidden cards are not reported as known.

Lookup is strict lexical lookup, not broad dictionary search. It returns
accessible candidates from one resolution tier:

1. exact, normalized, case-insensitive, and accent-insensitive headword
   candidates;
2. trusted `word_forms` candidates only when no headword candidate exists.

It must return every accessible candidate at the selected resolution tier rather
than selecting one arbitrary lemma. It must not include prefix, substring,
example, definition, fuzzy, alphabetical, or raw JSON fallback matches. For
example, `oog` returns meanings of `oog`, not `ogen`, `oogarts`, or `ooglid`;
`brandt` can resolve to `branden` through a trusted form; `de` returns the
lexical entry for `de`, not `deadline` or `deal`; a miss returns `items: []`.

`languageCode` is applied as a real filter. `contextText` and `intent` are
accepted and echoed as request metadata. They may later rerank ambiguous strict
candidates, but they must not switch lookup into example, definition, raw JSON,
or alphabetical search.

Match evidence is conservative: `exact` is returned for headword evidence,
`inflection` for trusted word-form evidence, and `unknown` only when a future
strict evidence source cannot be represented by those relations.

External clients such as AudioFilms must derive clicked-word `cards[]` from
`/lookup` or `/catalog/lookup`. Grouped search is preview/navigation data and
must not populate clicked-word cards.

`entry.content` and `entry.contentFingerprint` are the preferred external
dictionary contract. `entry.content.sections[]` provides stable IDs and source
paths for learner-visible meaning/example/idiom nodes. The fingerprint is based
on learner-visible normalized content and excludes volatile diagnostics such as
`sourceMeta`. `entry.raw` remains available for compatibility and diagnostics,
but external clients should not parse it as the primary shape.

`availableActions` is the legacy broad action list. New clients should prefer
`cardCapabilitiesByType["word-to-definition"]` when deciding which training
controls to render for a specific card type. Capabilities are phase-aware:
`not-started` and `encountered` cards allow `start-learning` and `mark-known`;
`learning` and `reviewing` cards allow `review-card` plus `reviewResults`;
`hidden` and currently `frozen` cards expose no first-redesign progress actions.
`mark-known` is an action label and maps to an `easy` review result through
`POST /actions`; it is not a persisted progress status.

## `POST /catalog/lookup`

Guest-safe public catalog lookup for external clients such as AudioFilms before
the user connects a 2000NL account.

Authenticate with the dedicated catalog token:

```http
Authorization: Bearer <PLATFORM_CATALOG_ACCESS_TOKEN>
```

Request:
```json
{
  "query": "huis",
  "languageCode": "nl",
  "contextText": "optional surrounding text",
  "intent": "external-click"
}
```

The response uses the same `query`, `request`, `items[].entry`,
`items[].dictionary`, and `items[].match` shape as `/lookup`, including
normalized `entry.content` and `contentFingerprint`.

Catalog lookup follows the same strict lexical lookup policy as authenticated
`/lookup`, but it is hard-limited in SQL to dictionaries with `visibility` of
`system` or `public`. It does not run under an end-user Supabase JWT and must
not return private dictionaries, `userStateByCardType`, `progressSummary`,
`listMemberships`, `cardCapabilitiesByType`, or `availableActions`.

## `POST /search`

Authenticated grouped dictionary discovery search.

This endpoint is separate from strict lookup. Search returns small grouped
previews and group-specific pages for a Van Dale-style discovery surface. It is
for finding dictionary material around a query, not for producing learner cards
for a clicked word.

The current regression corpus and Van Dale reference measurements are tracked in
`docs/discovery/2026-06-24-vandale-style-dictionary-search.md`.

Request for all group previews:

```json
{
  "query": "oog",
  "languageCode": "nl",
  "limit": 6
}
```

Request for one group page:

```json
{
  "query": "oog",
  "languageCode": "nl",
  "group": "examples",
  "limit": 50,
  "cursor": "opaque-cursor"
}
```

Response shape:

```json
{
  "contractVersion": "dictionary-search-v1",
  "query": "oog",
  "request": {
    "languageCode": "nl",
    "scope": "authenticated"
  },
  "groups": [
    {
      "id": "headwords",
      "total": 2,
      "items": [
        {
          "kind": "entry",
          "entry": {
            "id": "entry-id",
            "languageCode": "nl",
            "headword": "oog",
            "meaningId": 1,
            "partOfSpeech": "zn",
            "summaryDefinition": "..."
          },
          "dictionary": {
            "id": "dictionary-id",
            "slug": "nl-vandale",
            "name": "VanDale Dutch",
            "kind": "curated"
          },
          "match": {
            "relation": "exact",
            "matchedText": "oog",
            "sourcePath": "word_entries.headword"
          }
        }
      ],
      "page": {
        "limit": 6,
        "nextCursor": null,
        "hasMore": false
      }
    },
    {
      "id": "examples",
      "total": 13,
      "items": [
        {
          "kind": "field-match",
          "resultKey": "entry-id:raw.meanings[0].examples[1]",
          "entry": {
            "id": "entry-id",
            "headword": "onder vier ogen"
          },
          "field": {
            "kind": "example",
            "sourcePath": "raw.meanings[0].examples[1]",
            "text": "Wij spreken elkaar onder vier ogen."
          },
          "match": {
            "matchedText": "ogen"
          }
        }
      ],
      "page": {
        "limit": 6,
        "nextCursor": "opaque-cursor",
        "hasMore": true
      }
    },
    {
      "id": "definitions",
      "total": 13,
      "items": [],
      "page": {
        "limit": 6,
        "nextCursor": "opaque-cursor",
        "hasMore": true
      }
    },
    {
      "id": "alphabetical",
      "total": 14449,
      "items": [],
      "page": {
        "limit": 6,
        "nextCursor": "opaque-cursor",
        "hasMore": true
      }
    }
  ]
}
```

Normative group IDs:

- `headwords` - exact/normalized headwords and trusted forms, represented as
  entry preview rows;
- `examples` - example and idiom-expression field matches;
- `definitions` - definition, context, note, and idiom-explanation field
  matches;
- `alphabetical` - an ordered browse window anchored near the normalized query.

`alphabetical` is not substring or related-headword search. Related compounds
can become a separate optional group later.

`total` counts result items available in that group, not the number returned in
the preview. Each group owns independent pagination through opaque cursors.
Do not expose durable page counts. Display labels can be client-localized;
`id` is the stable contract.

Grouped search normally returns previews only. It should not hydrate user
progress, list memberships, actions, translations, full normalized card content,
or `raw` unless an explicit later contract adds such overlays. Examples and
definitions are first-class field matches keyed by stable `(entryId,
sourcePath)`, not full dictionary cards. Search must not expose HTML
highlighting; use `matchedText` first and add explicit character ranges later
if needed.

If the grouped search index is not ready, return `503` with:

```json
{
  "error": "search_index_not_ready",
  "detail": "Grouped dictionary search index is not ready."
}
```

Do not return empty groups for index-readiness failures, because that converts
an operational fault into a false dictionary miss.

## `POST /catalog/search`

Guest-safe public grouped dictionary discovery search.

Authenticate with the dedicated catalog token:

```http
Authorization: Bearer <PLATFORM_CATALOG_ACCESS_TOKEN>
```

Request and response shapes match `/search`, except
`request.scope` is `public-catalog` and all counts/candidates are hard-limited
in SQL to dictionaries with `visibility` of `system` or `public`.

Catalog search must not return private dictionaries, user state, list
memberships, action capabilities, translations, full card content, or `raw`.

## External Translation Flow

Dictionary lookup can return cached provider-backed translations when the client
opts in with `includeTranslations: true`. `POST /lookup` still returns the
accessible dictionary entries and user learning state, and it never performs a
long provider generation call. For authenticated users it resolves
`user_settings.translation_lang` server-side, reads matching
`word_entry_translations` cache rows with the server-side client, and attaches
ready translations to the normalized `entry.content` projection.

Some dictionary entries can still contain source translations in `entry.raw`
when the dictionary schema provides them, for example user-owned
`user-entry-v1` records with a `raw.translation` field. Those source
translations are part of the entry payload. Provider-backed translations are
different: they are cached overlays associated with an entry, target language,
and provider.

For an external app such as AudioFilms that needs a translation for a selected
lookup result:

1. Call `POST /api/platform/v1/lookup` with the selected word or phrase and
   `includeTranslations: true`.
2. Render dictionary-card translations from
   `items[].entry.content.headwordTranslation`,
   `items[].entry.content.summary.*Translation`, and
   `items[].entry.content.sections[].translation`.
3. Use `items[].translation.status` or `items[].entry.content.translation.status`
   to distinguish `ready`, `pending`, `failed`, and `not_available`.
4. Use `POST /api/platform/v1/translation` only as a fallback/refresh path, or
   for future non-dictionary card translation flows.

When a cached overlay is ready, lookup maps overlay values back to the same
stable `sections[].sourcePath` values that identify the original content. If one
example or idiom translation is missing, only that section lacks
`translation`; neighboring sections are not shifted by index. Guest catalog
lookup can accept `includeTranslations: true`, but it does not infer a target
language and returns `translation.status: "not_available"`.

The translation endpoint writes the overlay cache; it does not rewrite the
source dictionary entry. Repeated requests for the same entry, target language,
provider, source fingerprint, and prompt fingerprint should reuse the cached
overlay. A request can return `status: "pending"` when another request is
already producing the same overlay, and clients should retry after a short
delay.

## `POST /user-dictionary/generated-entry/draft`

Authenticated provider-backed draft generation for lookup misses. This endpoint
calls the configured OpenAI/Azure OpenAI chat-completions provider and returns a
same-language lookup-like learner-card draft candidate. It does not write
`word_entries`, lists, review logs, FSRS state, or provenance action events.

Use `/api/platform/v1/user-dictionary/generated-entry/draft` from external
clients. The Bearer token must resolve to a first-party user or a connected
client with `platform:write`.

Request:
```json
{
  "clickedForm": "gedoe",
  "languageCode": "nl",
  "contextText": "Wat een gedoe.",
  "draftSetId": "gds_... optional for regeneration",
  "sourceContext": {
    "contractVersion": "source-context-v2"
  }
}
```

`contextText` is required so the platform can choose the intended sense. A full
card regeneration sends the previous `draftSetId`; the endpoint returns a new
candidate in that same draft set and does not overwrite earlier candidates.

Response:
```json
{
  "ok": true,
  "draft": {
    "draftSetId": "gds_...",
    "candidateId": "gdc_...",
    "revision": 1,
    "clickedForm": "gedoe",
    "languageCode": "nl",
    "contextText": "Wat een gedoe.",
    "item": {
      "draftSetId": "gds_...",
      "candidateId": "gdc_...",
      "revision": 1,
      "entry": {
        "id": "draft:gdc_...",
        "dictionaryId": null,
        "languageCode": "nl",
        "headword": "gedoe",
        "meaningId": null,
        "partOfSpeech": "zn",
        "gender": null,
        "content": {
          "headword": "gedoe",
          "languageCode": "nl",
          "partOfSpeech": "zn",
          "sections": [
            {
              "id": "meaning-1",
              "kind": "meaning",
              "text": "Een situatie die veel moeite of ongemak geeft."
            },
            {
              "id": "example-1",
              "kind": "example",
              "text": "Wat een gedoe met die tickets."
            }
          ],
          "summary": {
            "definition": "Een situatie die veel moeite of ongemak geeft.",
            "example": "Wat een gedoe met die tickets."
          }
        },
        "contentFingerprint": "sha256...",
        "isGeneratedDraft": true
      },
      "cardCapabilitiesByType": {
        "word-to-definition": {
          "phase": "draft",
          "actions": ["save-and-start-learning"]
        }
      },
      "availableActions": ["save-and-start-learning"],
      "generation": {
        "status": "draft",
        "provider": "openai",
        "model": "gpt-...",
        "promptVersion": "generated-user-entry-v1",
        "contentFingerprint": "sha256...",
        "requiresExplicitSave": true
      }
    }
  },
  "generation": {
    "status": "draft",
    "provider": "openai",
    "model": "gpt-...",
    "promptVersion": "generated-user-entry-v1",
    "contentFingerprint": "sha256...",
    "requiresExplicitSave": true
  },
  "nextActions": ["save-and-start-learning"]
}
```

If `contextText` is missing, the endpoint returns
`400 { "error": "missing_context_text" }`. If no provider key is configured,
the endpoint fails closed with
`503 { "error": "generated_entry_provider_not_configured" }`. Provider errors
return `502 { "error": "generated_entry_provider_failed" }`.

## `POST /user-dictionary/generated-entry`

Authenticated write endpoint for persisting an explicitly accepted generated
dictionary card after lookup returns no suitable entry. This endpoint is for
the durable save step only: it does not start learning or write review/progress
state.

Use `/api/platform/v1/user-dictionary/generated-entry` from external clients.
The Bearer token must resolve to a first-party user or a connected client with
`platform:write`.

Request:
```json
{
  "clickedForm": "gedoe",
  "languageCode": "nl",
  "contextText": "Wat een gedoe.",
  "sourceContext": {
    "contractVersion": "source-context-v2"
  },
  "draftSetId": "gds_...",
  "candidateId": "gdc_...",
  "revision": 1,
  "item": {
    "entry": {
      "contentFingerprint": "sha256...",
      "content": {
        "headword": "gedoe",
        "languageCode": "nl",
        "partOfSpeech": "zn",
        "sections": [
          {
            "id": "meaning-1",
            "kind": "meaning",
            "text": "Een situatie die veel moeite of ongemak geeft."
          },
          {
            "id": "example-1",
            "kind": "example",
            "text": "Wat een gedoe."
          }
        ],
        "summary": {
          "definition": "Een situatie die veel moeite of ongemak geeft.",
          "example": "Wat een gedoe."
        }
      }
    },
    "generation": {
      "provider": "openai",
      "model": "gpt-...",
      "promptVersion": "generated-user-entry-v1"
    }
  }
}
```

The endpoint builds a `user-entry-v1` payload, adds `tags: ["generated"]`, and
stores the selected `draftSetId`, `candidateId`, `revision`, provider metadata,
and content fingerprint in `word_entries.raw.generation`. Generated entries are
created in the user's private editable `user-entry-v1` dictionary through
`create_user_dictionary_entry`; they are not curated/system entries. Requests
without selected candidate identity fail with
`400 { "error": "missing_draft_candidate" }`.

Response:
```json
{
  "ok": true,
  "entryId": "entry-uuid",
  "dictionaryId": null,
  "generation": {
    "status": "persisted",
    "draftSetId": "gds_...",
    "candidateId": "gdc_...",
    "revision": 1,
    "requiresExplicitStartLearning": true
  },
  "nextActions": ["start-learning"]
}
```

Duplicate handling follows user dictionary uniqueness: another entry with the
same dictionary, language, headword, and meaning id returns
`409 { "error": "duplicate_user_entry" }`. After a successful save, clients
should refresh normal `/lookup` and render the returned persisted card state.
To start learning, call `POST /api/platform/v1/actions` with
`action: "start-learning"` and the returned `entryId`.

## `POST /translation`

Provider-backed translation overlay for an accessible dictionary entry. This
endpoint may write the translation cache, but it does not mutate FSRS state,
list membership, or source dictionary content.

Request:
```json
{
  "entryId": "entry-id",
  "targetLang": "ru",
  "force": false
}
```

`targetLang` may be omitted. When omitted, 2000NL resolves the target from
`user_settings.translation_lang`, defaults unset preferences to `en`, and always
returns the resolved `targetLang` in the response. Explicit `off` fails closed
with `error: "translation_disabled"`.

Response when a ready overlay is available:
```json
{
  "entryId": "entry-id",
  "targetLang": "ru",
  "status": "ready",
  "overlay": {
    "headword": "дом",
    "meanings": [
      {
        "definition": "здание для жилья"
      }
    ],
    "__meta": {
      "translatedPaths": [["headword"], ["meanings", 0, "definition"]]
    }
  },
  "note": null
}
```

Response when another request is already producing the same overlay:
```json
{
  "entryId": "entry-id",
  "targetLang": "ru",
  "status": "pending"
}
```

`force: true` refreshes the overlay even when a ready cached row exists. The
endpoint gates source entry access before any service-role cache read/write, so
private user-dictionary entries remain visible only to authorized users.
Ready overlays include best-effort `overlay.__meta.translatedPaths` so
line-level clients can correlate translated values with stable lookup content
paths without parsing provider diagnostics.

## `POST /text-translation`

Provider-backed free-text or phrase translation. This endpoint is separate from
entry overlay translation and must be used for Recall / Show Translation phrase
flows that are not dictionary-card overlays.

Request:
```json
{
  "text": "ik ga naar huis",
  "sourceLanguageCode": "nl",
  "targetLanguageCode": "en",
  "purpose": "youtube-phrase-practice",
  "contextText": "optional surrounding context"
}
```

`targetLanguageCode` may be omitted and resolves through the same
`user_settings.translation_lang` preference as `/translation`. When `purpose`
is omitted, the platform defaults it to `youtube-phrase-practice`.

Response:
```json
{
  "translationId": "sha256-artifact-id",
  "status": "ready",
  "sourceTextHash": "sha256-source-text",
  "contextTextHash": "sha256-context-text",
  "sourceLanguageCode": "nl",
  "targetLanguageCode": "en",
  "translatedText": "I am going home",
  "translationPolicyVersion": "platform-text-translation-v1",
  "cached": false
}
```

2000NL owns the target preference, provider selection, prompt policy, and text
translation semantics. AudioFilms owns YouTube phrase association and any
client-side cache linkage. `translationId` is derived from source text hash,
optional context text hash, source language, resolved target language, purpose,
and `translationPolicyVersion`; it is stable for retries of the same artifact.
When `contextText` is supplied, the platform may pass it to a context-aware
provider prompt, so it participates in artifact identity and the response
includes `contextTextHash` alongside `sourceTextHash`.
The endpoint persists generic text translation artifacts in
`platform_text_translations`. Existing `pending`, `ready`, or `failed` artifacts
return with `cached: true`; a fresh provider call returns with `cached: false`.

## `POST /actions`

Explicit mutation endpoint. Supported action IDs are defined in `packages/shared/types/platform.ts`.
For active database/RPC write-order, idempotency, and provenance behavior, see
[`platform-provenance-rpc.md`](platform-provenance-rpc.md).

Examples:
```json
{
  "action": "start-learning",
  "entryId": "entry-id",
  "cardTypeId": "word-to-definition",
  "clientEventId": "8b9df84e-7956-4712-a39a-3ea8363be1cf",
  "sourceContext": {
    "contractVersion": "source-context-v1",
    "client": {
      "id": "audiofilms_chrome",
      "version": "1.2.3"
    },
    "source": {
      "kind": "youtube_video",
      "provider": "youtube",
      "externalId": "4EE7m94mJpk",
      "url": "https://www.youtube.com/watch?v=4EE7m94mJpk",
      "languageCode": "nl"
    },
    "location": {
      "kind": "caption_phrase",
      "phraseIndex": 12,
      "startMs": 54210,
      "endMs": 58100
    },
    "context": {
      "clickedForm": "huis",
      "text": "bounded surrounding phrase"
    }
  }
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

Review-card mutations pass `turnId` through to `handle_card_review` as
`p_turn_id`; that RPC is the idempotency boundary for repeated connected-client
turn submissions. Platform writes require a valid bearer token and use the
authenticated Supabase user id for every user-scoped mutation. Connected Client
writes additionally require `platform:write`.

External clients that need source/provenance tracking should send
`clientEventId` for every explicit card action. When `sourceContext` is present,
`clientEventId` is required. `clientEventId` is scoped to the authenticated user:
the first accepted request wins, an identical retry returns the already recorded
provenance event, and a retry with a different action payload or source context
returns an idempotency conflict without applying another mutation.

`turnId` remains the review-turn idempotency value used by `handle_card_review`.
For provenance-aware `review-card`, `mark-known`, and `mark-unknown` requests,
clients should send a UUID `clientEventId` and may omit `turnId`; the platform
can use the UUID `clientEventId` as the review turn id. If `turnId` is supplied
with a provenance-aware request, it must be a UUID.

Minimum `sourceContext` envelope:

- `contractVersion`: currently `source-context-v1`.
- `client.id`: optional client-reported identity observation. For Connected
  Client requests, if present it must match the authenticated Connect
  `client_id`; the persisted authoritative actor is stored separately from this
  JSON as `auth_kind` and `connected_client_id`.
- `source.kind`: filterable source kind, such as `youtube_video`.
- `source.provider`, `source.externalId`, or `source.url`: canonical source
  identity inputs. The platform normalizes these into a source identity row.
- `location`: optional location within the source, such as a caption phrase time
  span.
- `context.clickedForm` and bounded `context.text`: optional context used for
  diagnostics and future source-linked review UX. The platform truncates and
  hashes context for queryable event records.

`source-context-v2` is the strict provenance contract for new producers. The
currently accepted source kinds are:

- `youtube_video`: public canonical video provenance. 2000NL derives canonical
  source identity from the validated video id and strips client-observed titles,
  URLs, playback samples, and diagnostics from canonical identity.
- `web_page`, `text_document`, and `ebook`: private-source provenance. 2000NL
  stores a user-scoped/private canonical source identity derived from validated
  client-provided source fields and does not treat a raw URL/title as globally
  trusted public identity.

Canonical YouTube example:

```json
{
  "contractVersion": "source-context-v2",
  "source": {
    "kind": "youtube_video",
    "provider": "youtube",
    "externalId": "4EE7m94mJpk",
    "languageCode": "nl"
  },
  "artifact": {
    "artifactKind": "caption_phrase_set",
    "producer": "audiofilms_backend",
    "phraseSetRevisionId": "phrases-v1",
    "timingEvidenceRevisionId": "timing-v1",
    "builderVersion": "builder-1",
    "quality": "aligned"
  },
  "location": {
    "kind": "caption_phrase",
    "phraseIndex": 12,
    "startMs": 54210,
    "endMs": 58100,
    "locatorConfidence": "canonical"
  },
  "selection": {
    "clickedForm": "huis",
    "tokenIndex": 3,
    "charStart": 11,
    "charEnd": 15,
    "contextText": "bounded surrounding phrase"
  },
  "observation": {
    "currentPlaybackTimeMs": 55000
  }
}
```

For v2, 2000NL derives the canonical YouTube URL from the validated video id.
Client-observed titles, URLs, playback samples, and diagnostics are not allowed
to control canonical source identity or idempotency. The HTTP normalizer passes
only canonical source, artifact, location, selection, and bounded context fields
into the atomic action RPC; volatile observation and diagnostics are
intentionally excluded from the persisted action payload. The database also
normalizes v2 source rows before insert/update, so direct RPC callers cannot
persist a client title, alternate URL, or client metadata on a canonical YouTube
source. The database computes a SHA-256 idempotency fingerprint for v2 from the
normalized action tuple plus canonical source, artifact, location, selection,
and bounded context. A retry that changes only observation or diagnostics
returns the original duplicate event rather than `409`.
For private source kinds, the same v2 idempotency rule applies: semantic action,
canonical source, artifact, location, selection, and bounded context fields
participate in the fingerprint, while observation and diagnostics do not.

For v2 provenance-aware review actions, `clientEventId` must be a UUID. If a
`turnId` is supplied, it must equal `clientEventId`; otherwise the platform uses
the UUID `clientEventId` as the review turn id. If that review turn id was
already consumed outside the same provenance event, the platform rejects the
request with `409 review_turn_already_consumed` instead of recording an accepted
provenance event for a review mutation that did not apply.

Current idempotency matrix:

| Action | `clientEventId` for source-aware external clients | Card mutation | Retry behavior |
| --- | --- | --- | --- |
| `record-view` | Required when provenance is sent | `record_card_view` | Same event id is a no-op duplicate |
| `start-learning` | Required when provenance is sent | `start_learning_entry_card` | Same event id is a no-op duplicate |
| `mark-known` | Required | `handle_card_review(..., "easy")` | Same event id/turn id is a no-op duplicate |
| `mark-unknown` | Required | `handle_card_review(..., "fail")` | Same event id/turn id is a no-op duplicate |
| `review-card` | Required | `handle_card_review(..., result)` | Same event id/turn id is a no-op duplicate |

Source/provenance storage is normalized into source, source-location, and
user-card-action event rows. `user_review_log.metadata` remains FSRS diagnostic
metadata and is not the primary source filtering surface.

### Training Filter Provenance Requirements

2000NL training filters use accepted card action provenance events as their
read model. External clients such as AudioFilms do not own the filtered queue,
but they must send stable provenance when an action should later be available
under `today`, `yesterday`, source, or video-scoped training.

For a card to be discoverable by source-aware training filters, send:

- an explicit card action (`record-view`, `start-learning`, `mark-known`,
  `mark-unknown`, or `review-card`);
- a UUID `clientEventId`;
- `sourceContext.contractVersion = "source-context-v2"`;
- `source.kind`, `source.provider`, and a stable source identity. For YouTube,
  use `source.kind = "youtube_video"`, `source.provider = "youtube"`, and the
  canonical YouTube video id in `source.externalId`;
- the normal action identity: `entryId`, `cardTypeId`, and action/result fields.

The training date filter is based on the persisted action event timestamp in
the learner's selected timezone. Clients should not send their own "training
date" field. Source labels shown in the 2000NL UI come from the normalized
source row; for YouTube this is rendered as `YouTube · <title or video id>`.

Volatile observation fields, diagnostics, playback samples, and client-rendered
phrases are useful for troubleshooting but do not define source identity and are
not enough to make a card source-filterable. Ordinary read-only lookup without
an explicit card action remains read-only and does not add a card to a filtered
training queue.

## `GET /learning/activity`

Read-only source-aware activity feed for accepted card action events. Connected
Clients need `platform:read`.

Common filters:

- `occurredAfter`, `occurredBefore`: ISO timestamps applied to event
  `created_at`.
- `sourceKind`, `sourceProvider`, `sourceExternalId`, `sourceId`: normalized
  source filters. For YouTube, use normalized video id in `sourceExternalId`;
  do not filter by raw URL.
- `artifactId`, `phraseSetRevisionId`: artifact/revision filters where the
  action was recorded with `source-context-v2`.
- `action`, `result`, `entryId`, `cardTypeId`, `connectedClientId`.
- `limit`: 1-100, default 50.
- `cursor`: opaque cursor from the previous response. Pagination is ordered by
  `(created_at, id)` descending, never by offset.

Response:

```json
{
  "items": [
    {
      "id": "event-id",
      "occurredAt": "2026-06-01T10:00:00.000Z",
      "action": "review-card",
      "result": "success",
      "clientEventId": "client-event-id",
      "turnId": "turn-id",
      "entry": {
        "id": "entry-id",
        "cardTypeId": "word-to-definition"
      },
      "source": {
        "id": "source-id",
        "kind": "youtube_video",
        "provider": "youtube",
        "externalId": "4EE7m94mJpk",
        "canonicalUrl": "https://www.youtube.com/watch?v=4EE7m94mJpk",
        "languageCode": "nl"
      },
      "artifact": {
        "id": "artifact-id",
        "sourceId": "source-id",
        "kind": "caption_phrase_set",
        "producer": "audiofilms_backend",
        "phraseSetRevisionId": "phrases-v1"
      },
      "location": {
        "id": "location-id",
        "sourceId": "source-id",
        "artifactId": "artifact-id",
        "kind": "caption_phrase",
        "startMs": 54210,
        "endMs": 58100,
        "phraseIndex": 12,
        "textHash": "bounded-context-hash"
      },
      "selection": {
        "clickedForm": "huis",
        "contextTextHash": "bounded-context-hash"
      },
      "actor": {
        "authKind": "connected_client",
        "connectedClientId": "audiofilms_chrome"
      }
    }
  ],
  "nextCursor": null
}
```

The response intentionally excludes raw `source_context`, diagnostics,
unsanitized context text, private page/document bodies, and URL credentials.
`source.canonicalUrl` is exposed for canonical public YouTube sources only;
private source kinds return safe normalized identifiers and a null
`canonicalUrl`.

## `GET /learning/cards`

Read-only card filter endpoint for source-matched learning work. It accepts the
same filters and cursor parameters as `/learning/activity`, collapses matching
events by `(entryId, cardTypeId)`, and returns the current card state from the
existing card-state RPC plus a provenance summary.

Response:

```json
{
  "items": [
    {
      "entryId": "entry-id",
      "cardTypeId": "word-to-definition",
      "state": {
        "entryId": "entry-id",
        "cardTypeId": "word-to-definition",
        "clickCount": 4,
        "seenCount": 5,
        "successCount": 3,
        "lastSeenAt": "2026-06-02T10:00:00.000Z",
        "lastReviewedAt": "2026-06-02T10:00:00.000Z",
        "nextReviewAt": "2026-06-03T10:00:00.000Z",
        "hidden": false,
        "frozenUntil": null,
        "inLearning": true,
        "learningDueAt": "2026-06-03T10:00:00.000Z",
        "fsrs": {
          "stability": 2.5,
          "difficulty": 6.1,
          "reps": 3,
          "lapses": 0,
          "lastGrade": 3,
          "lastInterval": 2,
          "paramsVersion": "fsrs-6-default"
        }
      },
      "provenance": {
        "firstMatchedAt": "2026-06-01T10:00:00.000Z",
        "lastMatchedAt": "2026-06-01T11:00:00.000Z",
        "matchedEventCount": 2,
        "source": {
          "id": "source-id",
          "kind": "youtube_video",
          "provider": "youtube",
          "externalId": "4EE7m94mJpk",
          "canonicalUrl": "https://www.youtube.com/watch?v=4EE7m94mJpk",
          "languageCode": "nl"
        }
      }
    }
  ],
  "nextCursor": null
}
```

This endpoint does not write source ids onto `user_card_status`; current card
state remains authoritative and source matching is derived from accepted action
events.

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
