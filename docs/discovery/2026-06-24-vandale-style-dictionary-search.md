# Van Dale Style Dictionary Search Discovery

Date: 2026-06-24
Status: discovery / senior architect review input
Owner boundary: 2000NL owns dictionary lookup/search contracts and backend
query behavior. AudioFilms is the connected client exposing the issue.

## Why This Exists

AudioFilms YouTube extension dictionary cards take several seconds after a user
clicks a Dutch word. The user also identified Van Dale as the preferred
interaction reference: fast, grouped, precise, and easy to scan.

This note records the evidence gathered before changing code. It is intended as
input for a senior architecture review and for the next implementation plan.

Related 2000NL work:

- `docs/exec-plans/active/dictionary-search-v2-search-documents.md`
- `db/migrations/071_dictionary_search_documents.sql`
- `db/migrations/072_dictionary_search_v2_rpcs.sql`
- `apps/ui/lib/platform/platformApi.ts`

Related connected-client path:

- AudioFilms extension service worker sends `af-dictionary-command` /
  `dict-lookup`.
- AudioFilms backend handles `POST /api/dict/lookup`.
- AudioFilms forwards guest lookup to 2000NL `POST /api/platform/v1/catalog/lookup`.
- 2000NL catalog lookup currently calls `search_public_catalog_entries`.

## User Reference: Van Dale

Reference URL captured from the user's authenticated Chrome session:

```text
https://zoeken.vandale.nl/?dictionaryId=fnt&article=%7B%22search%22%3A%22%C3%A9cht%22,%22index%22%3A0,%22type%22%3A%22EXACT%22,%22dictionaryId%22%3A%22fnt%22%7D&query=%C3%A9cht
```

The visible Van Dale grouping for `echt` / `écht`:

- `Headwords (3)`
- `Example sentences (35)`
- `Within definitions (93)`
- `Alphabetical (14449)`

The user likes this model:

- headwords first;
- then examples;
- then within definitions;
- then alphabetical browsing;
- very fast;
- grouped rather than mixed into one confusing result list.

## Van Dale Network Findings

Observed through the user's Chrome tab with DevTools network events. No account
settings or user data were modified.

Primary search endpoint:

```text
GET https://zoeken.vandale.nl/api/zoeken/rest/articles?search=<word>&limit=6
```

Article endpoint for the selected exact result:

```text
GET https://zoeken.vandale.nl/api/zoeken/rest/articles?search=<word>&type=EXACT&dictionaryId=fnt&index=0
```

Group-specific "More results" endpoint:

```text
GET https://zoeken.vandale.nl/api/zoeken/rest/articles?search=<word>&groupType=EXAMPLE&page=0&limit=50&dictionaryId=fnt
```

For `oog`, clicking "More results" under examples triggered:

- `groupType=EXAMPLE&page=0&limit=50`, about `27.9ms`
- `groupType=EXAMPLE&page=1&limit=50`, about `25.1ms`

The primary search JSON shape:

```json
{
  "results": [
    {
      "headword": "oog",
      "type": "EXACT",
      "groupType": "EXACT",
      "search": "oog",
      "dictionaryId": "fnt",
      "index": 1,
      "content": "",
      "highlightingIndex": null
    }
  ],
  "groupData": [
    {
      "dictionaryId": "fnt",
      "groupType": "EXACT",
      "count": 2,
      "pageCount": 1
    }
  ]
}
```

For `oog`, `limit=6` returned `20` result rows:

- `EXACT`: 2 rows
- `EXAMPLE`: 6 rows
- `ARTICLE`: 6 rows
- `ALPHABETICAL`: 6 rows

The total counts lived in `groupData`:

- `EXACT`: 2
- `EXAMPLE`: 13
- `ARTICLE`: 13
- `ALPHABETICAL`: 14449

Important behavior: the initial response is grouped. It is not one global top-N
list where alphabetical or related headwords can crowd out examples.

## Van Dale Timing Sample

Network `receiveHeadersEnd` for the primary search API:

| Word | Van Dale API timing | Visible groups |
| --- | ---: | --- |
| `écht` | `26.9ms` | Headwords 3, Examples 35, Within definitions 93, Alphabetical 14449 |
| `oog` | `36.7ms` | Headwords 2, Examples 13, Within definitions 13, Alphabetical 14449 |
| `de` | `29.9ms` | Headwords 1, Examples 8304, Within definitions 8956, Alphabetical 14449 |
| `het` | `29.1ms` | Headwords 2, Examples 4909, Within definitions 6055, Alphabetical 14449 |
| `lopen` | `36.4ms` | Headwords 2, Examples 68, Within definitions 152, Alphabetical 14449 |
| `appel` | `38.9ms` | Headwords 2, Examples 17, Within definitions 18, Alphabetical 14449 |
| `huis` | `28.1ms` | Headwords 2, Examples 274, Within definitions 384, Alphabetical 14449 |
| `zijn` | `32.4ms` | Headwords 2, Examples 1869, Within definitions 2614, Alphabetical 14449 |
| `maken` | `33.1ms` | Headwords 2, Examples 153, Within definitions 737, Alphabetical 14449 |
| `kijken` | `28.2ms` | Headwords 2, Examples 47, Within definitions 99, Alphabetical 14449 |

Full page elapsed time in Chrome was usually around `800-900ms`, but the backend
search API itself responded in tens of milliseconds. The rest is app shell,
auth/userinfo, article loading, fonts, and rendering.

## Current AudioFilms / 2000NL Timing

Direct public AudioFilms lookup calls were made without the extension UI:

```text
POST https://audiofilms-api.dilum.io/api/dict/lookup
Content-Type: application/json

{
  "clickedForm": "<word>",
  "sourceLanguageCode": "nl",
  "contextText": "<word>"
}
```

AudioFilms health check:

- `https://audiofilms-api.dilum.io/api/health`: about `0.14s`

2000NL health check:

- `https://2000.dilum.io/api/health?deep=1`: about `0.28s`

So both services were up and responsive. The slow path is lookup-specific.

AudioFilms lookup timing sample:

| Word | AudioFilms `/api/dict/lookup` | First returned headwords |
| --- | ---: | --- |
| `echt` | `6.13s` | `echt`, `echt`, `echter`, `echtgenoot`, `echtpaar` |
| `oog` | `3.43s` | `oog`, `oog`, `ogen`, `oogarts`, `ooggetuige` |
| `de` | `5.76s` | `de`, `deadline`, `deal`, `dealen in`, `debacle` |
| `het` | `4.69s` | `het`, `heten`, `heterdaad`, `hetero`, `heterogeen` |
| `lopen` | `3.36s` | `lopen`, `lopen`, `lopen`, `lopen`, `lopen` |
| `appel` | `3.45s` | `appel`, `appel`, `appelflap`, `appelmoes`, `appelsien` |
| `huis` | `3.44s` | `huis`, `huizen`, `huisarrest`, `huisarts`, `huisartsenpost` |
| `zijn` | `3.99s` | `zijn`, `zijn`, `zijn`, `zijn`, `zijn` |
| `maken` | `3.45s` | `maken`, `maken`, `maken`, `maken`, `maken` |
| `kijken` | `3.69s` | `kijken`, `kijken`, `aankijken`, `aankijken op`, `afkijken` |

`curl` timing showed `time_starttransfer` almost equal to `time_total`, so the
delay is server-side response preparation, not transferring a large response.

## Current 2000NL DB Findings

Live DB checks were read-only.

`search_public_catalog_entries` timings:

| Query | Runtime |
| --- | ---: |
| `search_public_catalog_entries('oog','nl',1,10)` | about `4.0s` |
| `search_public_catalog_entries('de','nl',1,10)` | about `6.4s` |
| `search_public_catalog_entries('oog','nl',1,1)` | about `5.7s` |
| `search_public_catalog_entries('zz','nl',1,1)` | about `5.7s` |

Changing `page_size` did not materially help, because the function builds the
wide candidate set and counts/sorts before `LIMIT`.

Live table counts / sizes:

- `word_entries`: `17408` live rows, about `43 MB`
- `word_forms`: `46826` live rows, about `29 MB`
- `dictionary_search_documents`: `0` rows
- `dictionary_search_fields`: `0` rows

The dictionary size is not inherently large enough to require multi-second
lookup. Simple indexed probes were fast:

- exact headword lookup on `lower(headword)`: about `2-3ms`
- form lookup on `lower(form)`: about `2-7ms`

The existing v2 lookup function is fast but has no data to search:

```sql
select lookup_dictionary_entries_v2('oog','nl',null);
```

Observed runtime: about `11ms`, but response was empty because
`dictionary_search_documents` was empty.

## Current Grouping Problem

The current public catalog RPC already computes rough groups:

- `exact-headword`
- `lemma-or-inflection`
- `related-headword`
- `example`
- `definition`
- `fallback`

But the result contract returned to AudioFilms is a flat card list. In addition,
the current ranking places `related-headword` before `example` and `definition`.

For `oog`, a direct reconstruction of the current match groups found:

| Group | Count |
| --- | ---: |
| exact-headword | 2 |
| lemma-or-inflection | 1 |
| related-headword | 71 |
| example | 85 |
| definition | 140 |
| fallback | 55 |

But the first page is mostly related headwords:

```text
oog, oog, ogen, oogarts, ooggetuige, ooglid, ...
```

This differs from the Van Dale reference. In Van Dale, examples and definitions
are first-class groups ahead of alphabetical browsing. Related/alphabetical
items do not crowd out the clicked-word lookup.

## Working Conclusions

1. The current user-visible delay is not caused by the Chrome extension UI.
   Direct AudioFilms backend calls reproduce the same multi-second delay.

2. The current bottleneck is the 2000NL public catalog lookup path, especially
   `search_public_catalog_entries`.

3. The current search is doing too much for a clicked-word card:
   broad related-headword matching, raw JSON fallback, total counting, and
   sorting before returning the page.

4. The current response model is also wrong for the product experience. A click
   on a word should first return strict headword/form entries. Broader examples,
   definitions, and alphabetical browsing should be separate grouped surfaces.

5. The Van Dale model is a strong reference:
   grouped initial payload, small per-group previews, group totals, and
   group-specific pagination.

6. 2000NL already has the beginning of the right infrastructure:
   `dictionary_search_documents`, `dictionary_search_fields`, and
   `lookup_dictionary_entries_v2`. The live deployment currently has schema and
   functions but no search-document backfill.

7. Backfilling search documents is necessary but probably not sufficient. The
   platform API contract should expose grouped search/lookup semantics instead
   of forcing AudioFilms to interpret one flat catalog list.

## Candidate Target Model

Add a Van Dale style grouped search/read endpoint in 2000NL, or evolve the
catalog endpoint in that direction.

Candidate shape:

```json
{
  "query": "oog",
  "request": {
    "languageCode": "nl",
    "intent": "external-click"
  },
  "groups": [
    {
      "id": "headwords",
      "label": "Headwords",
      "count": 2,
      "pageCount": 1,
      "items": []
    },
    {
      "id": "examples",
      "label": "Example sentences",
      "count": 13,
      "pageCount": 3,
      "items": []
    },
    {
      "id": "definitions",
      "label": "Within definitions",
      "count": 13,
      "pageCount": 3,
      "items": []
    },
    {
      "id": "alphabetical",
      "label": "Alphabetical",
      "count": 14449,
      "pageCount": 2409,
      "items": []
    }
  ]
}
```

Suggested group mapping:

| Product group | Current / v2 source |
| --- | --- |
| Headwords | exact headword + normalized/accent-insensitive headword + trusted word forms |
| Example sentences | extracted example/idiom fields from `dictionary_search_fields` |
| Within definitions | extracted definition/context/note fields |
| Alphabetical | neighboring headwords / prefix / browse window |

For AudioFilms clicked-word cards:

- first render only the `headwords` group as dictionary cards;
- optionally show examples and definitions below as separate expandable groups;
- do not mix `alphabetical` candidates into the card list;
- use group-specific pagination for "More results".

## Follow-Up Comparison: Alphabetical And Definitions

After grouped search shipped, the AudioFilms extension exposed a concrete
no-match case: `gezichtsveld` has no learner card, but Van Dale still shows an
`Alphabetical` browse group. Van Dale's visible results were:

```text
gezicht
gezichtspunt
gezichtsverlies
gezien1 (bn)
gezien2 (vz)
```

2000NL initially returned only following rows such as `gezichtsverlies`,
`gezien`, `gezin`, and later rows. The accepted fix was to make
`alphabetical` a centered browse window around the normalized query's insertion
point for both exact matches and misses.

Exact-match spot checks showed the same principle:

| Query | Van Dale `Alphabetical` | 2000NL decision |
| --- | --- | --- |
| `oog` | `onzin`, `onzinnig`, `oog`, `oogarts`, `ooggetuige` | include previous rows before the exact match |
| `appel` | `appartement`, `appartementsgebouw`, `appel1`, `appel2`, `appelflap` | include previous rows before the exact match |
| `huis` | `huig`, `huilen`, `huis`, `huisarrest`, `huisarts` | include previous rows before the exact match |
| `gezichtsveld` | `gezicht`, `gezichtspunt`, `gezichtsverlies`, `gezien1`, `gezien2` | centered no-match window |
| `indie` | `indiaan`, `indicatie`, `indien`, `indienen`, `indirect` | centered no-match window |
| `cway` | `cv2`, `cv-ketel`, `cycloon`, `cyclus`, `cynisch` | centered no-match window |

One deliberate difference remains: 2000NL's alphabetical group uses
meaning-level `dictionary_search_documents`, not unique Van Dale article labels.
This means a verb such as `lopen` or `maken` can produce several visible rows
for the same headword. That is acceptable for now because 2000NL also projects
those meanings as separate learner cards. Deduplicating `alphabetical` to
article-level rows would make the preview disagree with the card model.

The `definitions` group was checked with `kwestie`.

Van Dale visible groups:

```text
Headwords: kwestie
Example sentences: kwestie, kwestie, kwestie, mening, vreedzaam
Within definitions: aangelegenheid, anders2, delicaat, kwestie, mening
Alphabetical: kwellen, kwelling, kwestie, kwetsbaar, kwetsen
```

2000NL production grouped search:

```text
headwords: kwestie, kwestie
examples: kwestie, kwestie, kwestie, mening, vreedzaam
definitions: zaak, vraagstuk, aangelegenheid, delicaat, punt
alphabetical: kwellen, kwelling, kwestie, kwestie, kwetsbaar
```

Decision: keep 2000NL's `definitions` ranking for now. Van Dale appears to use
a dictionary/article-order style within the group, while 2000NL's current order
puts stronger semantic definition matches first. For a learner-facing panel,
`zaak`, `vraagstuk`, `aangelegenheid`, `delicaat`, and `punt` are more useful
neighbors for understanding `kwestie` than copying the exact Van Dale ordering.
If literal dictionary browse order becomes a product requirement, add it as an
explicit mode or group variant rather than changing the default `definitions`
ranking.

## Candidate Implementation Tracks

Track A: Operational unblock

- Backfill `dictionary_search_documents` and `dictionary_search_fields` on live.
- Verify `lookup_dictionary_entries_v2` resolves representative words.
- Add health/deep diagnostics for search-document row counts and extraction
  version.

Track B: Contract design

- Define a grouped search contract for public catalog and authenticated lookup.
- Preserve privacy: catalog lookup only returns `system` / `public`
  dictionaries.
- Keep authenticated user state/progress only in authenticated lookup.
- Keep lookup read-only.

Track C: Query implementation

- Build grouped queries over extracted search tables.
- Return separate totals and preview items per group.
- Avoid raw JSON substring fallback in the default clicked-word path.
- Keep fallback search optional, probably behind an explicit search/browse mode.

Track D: AudioFilms integration

- Update AudioFilms `/api/dict/lookup` projection to consume strict headword
  cards first.
- Add optional grouped preview data to the extension dictionary panel only after
  the 2000NL contract is stable.
- Keep the current flat `cards[]` shape compatible during migration.

## Senior Architect Questions

1. Should 2000NL add a new endpoint, for example
   `POST /api/platform/v1/catalog/search`, instead of changing
   `/catalog/lookup` semantics?

2. Should `catalog/lookup` become strict clicked-word lookup only, while a new
   grouped search endpoint handles examples/definitions/alphabetical browsing?

3. Should authenticated `/lookup` and guest `/catalog/lookup` share one grouped
   matcher service internally, with user-state hydration applied only to
   headword/card results?

4. How should we model Van Dale-style `EXAMPLE` results in 2000NL?
   Are they article references with highlighted snippets, or should they become
   first-class result rows with `entryId`, `sourcePath`, `text`, and
   `highlightRange`?

5. What is the safe migration path for AudioFilms so current `cards[]` consumers
   keep working while grouped search is introduced?

6. Should the live search-document backfill happen before contract work, or
   should the grouped contract be designed first and backfilled against that
   shape?

7. What latency target should be accepted?
   Based on Van Dale, a backend target of `<100ms` for the grouped search API
   seems reasonable for this data scale, with page rendering allowed to be
   slower.

## Suggested Regression Corpus

Use these words to compare Van Dale, 2000NL grouped search, and AudioFilms:

- `echt`
- `écht`
- `oog`
- `de`
- `het`
- `lopen`
- `appel`
- `huis`
- `zijn`
- `maken`
- `kijken`
- `brandt`
- `brandde`
- `gebrand`

For each word, capture:

- backend latency;
- group counts;
- first 3-6 results per group;
- whether exact/form headword results appear before examples;
- whether examples appear before definitions;
- whether alphabetical results stay in their own group;
- whether clicked-word cards exclude unrelated alphabetical neighbors.

## Non-Goals For The First Fix

- Do not parse Van Dale private payloads into our product.
- Do not copy Van Dale content.
- Do not add an external search service before exhausting the current Postgres
  extracted-search design.
- Do not let AudioFilms parse 2000NL `entry.raw` or infer dictionary grouping on
  the client.
- Do not mutate learning state during lookup.
