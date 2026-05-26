# Multi-Source Fixture Plan

Last updated: 2026-05-26
Status: Approved baseline for local fixture implementation

## Purpose

The current UI has mostly been validated with one Dutch Van Dale-backed source.
Search/list/training IA needs fixture pressure from multiple dictionaries,
duplicate headwords, and at least one non-Dutch language before the UI can be
trusted.

This document defines the smallest useful fixture set and the local-only data
shape used to implement it.

Confirmed implementation policy:

- Add new dictionaries as local/test fixtures only.
- Use `kind = 'curated'`, `visibility = 'system'`, `minimum_subscription_tier = 'free'`.
- Do not create user-owned/private fixture dictionaries for the first pass.
- Keep fixture payloads VanDale-shaped so the current importer/parser and UI
  rendering paths can read them without a new schema.

## Recommendation

Use both fixture layers:

- DB fixture SQL for RPC/search behavior, dictionary access, duplicate
  headwords, and list membership.
- Mocked Playwright/component data for visual states that are hard to reach
  reliably in local auth/session setup, especially example-only and
  definition-only grouped search states before the ranked RPC ships.

There is currently no `db/seeds/` directory. Prefer adding a clearly named test
fixture path rather than hiding this in production migrations, for example:

- `db/test-fixtures/search_multisource.sql`
- `apps/ui/tests/fixtures/searchMultisource.ts`
- `apps/ui/playwright/fixtures/searchMultisource.ts`

If the project later standardizes seed/reset scripts, move the SQL fixture into
that path and keep the same data shape.

## Fixture Dictionaries

### Dutch Dictionary 1: Existing Trusted Source

Use existing `nl-vandale` as the trusted curated Dutch dictionary.

Required entries can reuse existing imported rows where practical:

- `huis`
- `kamer`
- `bank`
- `lopen`

Do not rely on the current corpus alone for all fixture assertions; exact row
availability and examples may drift with ingestion.

### Dutch Dictionary 2: Test Source

Create a small curated test dictionary:

- slug: `nl-test-lexicon`
- display name: `NL Testlexicon`
- language: `nl`
- kind: `curated`
- visibility: test/local only
- schema: reuse current VanDale-shaped schema if possible, otherwise a minimal
  structured test schema.

Proposed entries:

| Headword | Purpose | Minimal content |
|---|---|---|
| `huis` | Duplicate exact headword across Dutch sources. | "Woning; gebouw om in te wonen." |
| `huizen` | Lemma/inflection pressure for `huis`. | Plural/form-related entry or form mapping. |
| `bank` | Homograph pressure. | "Zitmeubel" meaning. |
| `bank` | Multi-meaning duplicate in same source. | "Financiele instelling" meaning. |
| `thuishaven` | Related/compound headword. | Contains `huis` inside headword. |
| `dak` | Definition-only match for `huis`. | Definition includes "bovenkant van een huis". |
| `sleutel` | Example-only match for `huis`. | Example includes "de sleutel van het huis". |
| `lopen` | Verb/part-of-speech filter pressure. | Verb entry with example. |
| `kamer` | Normal list/search row. | Noun entry. |
| `fiets` | No-overlap control entry. | Noun entry. |

Add `word_forms` rows where relevant:

- `huizen` -> `huis`
- `liep` -> `lopen`
- `gelopen` -> `lopen`

### Second Language: English

Create language `en` if local test data does not already include it.

Create two English dictionaries:

1. `en-test-core`
   - display name: `EN Core Test`
   - kind: curated
2. `en-test-extra`
   - display name: `EN Extra Test`
   - kind: curated
   - visibility: system/local fixture

Proposed English entries:

| Dictionary | Headword | Purpose | Minimal content |
|---|---|---|---|
| `en-test-core` | `house` | English exact lookup. | "A building for people to live in." |
| `en-test-extra` | `house` | Duplicate headword across English sources. | Alternate curated fixture wording. |
| `en-test-core` | `home` | Related lookup and translation contrast. | "The place where one lives." |
| `en-test-core` | `bank` | Cross-language duplicate headword. | Financial institution. |
| `en-test-extra` | `bank` | Duplicate with different source. | River edge or alternate meaning. |
| `en-test-core` | `roof` | Definition-only match for `house`. | Definition includes "top of a house". |
| `en-test-extra` | `key` | Example-only match for `house`. | Example includes "house key". |
| `en-test-core` | `run` | Form/part-of-speech pressure. | Verb entry. |
| `en-test-core` | `room` | Normal row. | Noun entry. |
| `en-test-extra` | `bike` | Second-source-only row. | Noun entry. |

Add `word_forms` rows:

- `houses` -> `house`
- `ran` -> `run`
- `running` -> `run`

### Third Language: French

Create language `fr` if local test data does not already include it.

Create two French curated dictionaries:

1. `fr-test-core`
   - display name: `FR Core Test`
   - kind: curated
2. `fr-test-extra`
   - display name: `FR Extra Test`
   - kind: curated

Each dictionary should contain ten VanDale-shaped fake entries. Include at
least these query-pressure rows across the two French dictionaries:

| Dictionary | Headword | Purpose | Minimal content |
|---|---|---|---|
| `fr-test-core` | `maison` | French exact lookup. | "Batiment ou l'on habite." |
| `fr-test-extra` | `maison` | Duplicate headword across French sources. | Alternate curated fixture wording. |
| `fr-test-core` | `banque` | Financial meaning. | Financial institution. |
| `fr-test-extra` | `banc` | Cross-source related form. | Seat/bench meaning. |
| `fr-test-core` | `toit` | Definition-only match for `maison`. | Definition includes "partie superieure d'une maison". |
| `fr-test-extra` | `cle` | Example-only match for `maison`. | Example includes "cle de la maison". |
| `fr-test-core` | `courir` | Verb/form pressure. | Verb entry. |

Add `word_forms` rows:

- `maisons` -> `maison`
- `couru` -> `courir`
- `courant` -> `courir`

## Fixture Lists

Create at least these learning lists:

| List | Type | Contents | Purpose |
|---|---|---|---|
| `VanDale 2k` | existing curated | Existing Dutch entries. | Baseline current product state. |
| `NL mixed source test` | curated or user | `huis` from both Dutch dictionaries, `dak`, `sleutel`, `kamer`. | Duplicate-source and list filtering. |
| `Multilingual fixture test` | curated | Dutch `huis`, English `house`, English `bank`, French `maison`. | Proves lists can mix languages/sources without user-owned dictionaries. |
| `Empty fixture list` | curated | none. | Empty list state. |

The mixed-source list should include entries from multiple dictionaries as
separate memberships. Do not collapse duplicate headwords into one list item.

## Required Query Cases

| Query | Expected evidence |
|---|---|
| `huis` | Exact Dutch `huis` appears before compounds/substring rows. |
| `huizen` | Form/inflection maps to `huis` or appears in lemma/form group. |
| `thuishaven` | Related headword/compound group. |
| `sleutel` with `huis` in example | Example-only group when searching the example term/state. |
| `dak` or `bovenkant` | Definition-only group. |
| `house` | English duplicate headword across two dictionaries. |
| `bank` | Duplicate headword across languages and sources; source/language labels required. |
| `zzzz-no-hit` | No-results state with current search scope. |

For example-only and definition-only tests, choose the query based on actual
structured fields after fixture implementation. The important requirement is
that the query appears outside the headword/form fields.

## Implementation Notes

DB fixture implementation should:

- insert dictionaries with stable slugs and names;
- insert entries with stable IDs or stable lookup keys;
- insert `word_forms` rows for lemma/inflection tests;
- insert curated fixture lists and list items;
- avoid production migrations unless fixtures are guarded as local/test data;
- include cleanup/idempotency so repeated local test runs do not duplicate rows.

Current fixture artifacts:

- JSON source templates live under `packages/ingestion/<lang>/<dictionary>/data/words_content/`.
- The local idempotent SQL seed lives at `db/test-fixtures/search_multisource.sql`.
- Load it only into a local/test database, for example:
  `psql "$SUPABASE_DB_URL" -f db/test-fixtures/search_multisource.sql`.

Mocked UI fixture implementation should:

- mirror the A3 `match_group` and `match_label` shape;
- include exact, lemma/form, related, example, definition, fallback, duplicate,
  empty, loading, and error states;
- be used by component tests before the ranked RPC exists;
- be replaced or narrowed once DB-backed Playwright tests can hit the ranked
  search path reliably.

## Validation

Once implemented:

- SQL/RPC tests should prove access gating, duplicate-source rows, group ranks,
  and list membership.
- Component tests should prove group rendering and row metadata.
- Playwright should capture at least exact `huis`, duplicate source, example-only
  match, definition-only match, mixed-language/source switch, and no-results.

Until the fixture is implemented, A4 may use mocked RPC responses for UI states
but must disclose that the screenshots are mocked.
