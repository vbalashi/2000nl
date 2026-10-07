# Contributing

## Add a new dictionary
1. Implement or update a scraper/parser in `packages/scraper` for the source format.
2. Store source data under an explicit source-data directory, following the current Van Dale pattern when possible: `packages/ingestion/<lang>/<source>/data/`.
3. Define the source-to-platform morphology mapping and run the [morphology acceptance checks](#morphology-normalization-and-display-order) before loading data.
4. Update or add ingestion scripts so entries load into `word_entries.raw` and related lookup/list tables.
5. Keep shared schemas/types aligned when the structured entry shape changes.
6. Run ingestion scripts to load into the DB.

## Add a new language
1. Create `packages/shared/schemas/<lang>/note.schema.json` describing the template.
2. Add language entry to `languages` table and shared constants.
3. Normalize source morphology labels through the parser/import adapter and shared contract; follow the requirements below.
4. Add a language-specific presentation rule and fixtures for the actual normalized person keys. UI should consume the public projection rather than parse provider field names.


## Morphology normalization and display order

Apply these requirements when adding a dictionary, converting an export, or
adding a language. Source adapters in `packages/scraper` and normalization in
`packages/ingestion` own provider-specific labels. Shared schemas/types and the
Platform projection own the supported public shape. Presentation owns the
language's grammatical order; do not add a UI ordering configuration for each
dictionary that represents the same grammatical roles.

### Map source labels before import

Document how the source identifies tense, person, number, pronoun groups,
politeness, and clause type. Map those labels to the supported structured shape
explicitly. For example, map a source label `1sg` to Dutch `ik` only when the
source language and grammatical meaning establish that correspondence. Do not
merge singular `zij` with plural `zij`, formal `u` with informal `jij`, or
main-clause forms with subordinate-clause forms. A grouped `hij/zij/het` row
must remain distinct from a plural `zij` row.

The current `conjugation_table` uses `present`, `past`, and `perfect` maps.
Van Dale keys are `ik`, `jij`, `u`, `hij_zij_het`, `wij`, `jullie`, and `zij`;
`dat_ik` and corresponding keys represent subordinate-clause variants.
`perfect.auxiliary` and `perfect.participle` are form roles, not persons.
These keys describe the current contract, not a universal morphology model.
If a source needs separate person/number/clause fields or additional tense,
mood, or gender distinctions, extend and document the shared contract and
projection before enabling that source. Do not silently coerce unsupported
categories into the nearest existing key.

Preserve multiple forms and alternate headwords. An object keyed only by the
form label can overwrite earlier alternatives: `rector` has both `rectrix`
and `rectrice`. Preserve original evidence and report unsupported mappings
through import diagnostics; missing forms must remain missing rather than
being inferred from another person or tense.

### Order forms by grammatical meaning

JSON object insertion order and PostgreSQL JSONB key order are not display
contracts. Keep ordered source lists as arrays. For maps, select presentation
order by the content language and normalized grammatical roles, independently
of the dictionary and the interface language. Keep every value attached to its
original role when ordering rows or columns.

The current shared article helper is
`apps/ui/lib/dictionary/conjugationPresentation.ts`. It orders the known Dutch,
English, French, and German person keys. Dutch rows follow
`ik → jij → u → hij/zij/het → wij → jullie → zij`; each supplied `dat …` row
follows its corresponding person. The helper also orders conjugation-only
summary fallbacks so object key order cannot select an arbitrary plural past.
Perfect displays auxiliary before participle, and noun/adjective form roles
have explicit presentation order.

Current compatibility behavior keeps unfamiliar person keys at the end and
retains incoming order for unsupported languages. Unknown tenses use the
existing generic form fallback. Those fallbacks preserve content but do not
establish complete grammatical support for a new source or language. Add the
mapping, presentation support, and fixtures needed by the source before
claiming that support. EN/FR/DE coverage currently uses synthetic fixtures;
validate real exports separately.

### Acceptance checks for a new source

- Inventory every distinct morphology structure in the export, including
  partial tables, multiple alternatives, and unsupported categories.
- Verify parser/import mappings and the public projection against source
  examples. Include regular, irregular, and separable verbs where applicable;
  distinguish ambiguous singular/plural and formal/informal labels.
- Reorder object keys to JSONB order or shuffle them, then check the rendered
  person order, tense columns, summary selection, and unchanged cell values.
  Test missing cells, unknown keys, subordinate rows, and empty perfect data.
- Verify noun/adjective roles and multiple values survive conversion and
  presentation. Preserve array order for meanings, examples, and alternatives.
- Run ingestion tests and the focused UI presentation tests. Extend corpus
  auditing for the new language/shape; the existing
  `apps/ui/scripts/auditConjugationOrdering.ts` is specifically a Dutch Van Dale
  audit against source row order, not a universal dictionary validator.

The regression tests are `apps/ui/tests/conjugationPresentation.test.ts` and
`apps/ui/tests/wordDetailsPresentation.test.tsx`. The ordering and alternative
preservation fix is recorded in [PR #587](https://github.com/vbalashi/2000nl/pull/587).

## Add a card type
1. Append a new entry to `packages/shared/card-types/card-types.json` with prompt/reveal fields and `input_mode`.
2. Implement UI rendering if a new `input_mode` is needed; reuse existing components when possible.
3. Ensure the current training/session path can emit this card type. Today that usually means checking DB-side selection logic and the UI flow, not a standalone `apps/api` service.

## Add a list
1. Insert curated lists into `word_lists`, or use the active app/runtime path for user lists.
2. Populate `word_list_items` or `user_word_list_items` referencing `word_id`.

## Development
- UI lives in `apps/ui` (Next.js). Install and run from that directory.
- Ingestion scripts in `packages/ingestion/scripts` use `requirements.txt`.
- Keep shared schemas/types aligned with the active `word_entries.raw` shape and UI expectations.
