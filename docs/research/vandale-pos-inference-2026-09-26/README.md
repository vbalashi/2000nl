# Van Dale POS inference correction — 2026-09-26

Owning issue: [#514](https://github.com/vbalashi/2000nl/issues/514).

The previous parser scanned every word in `span.f3v` for `heeft / hebben / is /
zijn`. That block contains pronunciation and notes as well as forms. Regex word
boundaries split on the syllable dot in `is·lam` and `wel·zijn`; the rule ran
before the noun article fallback. The source's clean `headword` was available,
but searching it would still confuse headword identity with conjugation evidence.

The replacement examines only `f1k` grammar spans in parenthesized form groups,
requires a past-form segment followed by an auxiliary and a nonempty perfect-form
segment, and stops at labels/semicolons. `f1v` labels and colon-prefixed notes do
not supply evidence. Existing explicit POS and conjugation-table paths, identity,
and `known`/`unresolved` semantics are unchanged.

## Validation

- Before the fix: 8 regression cases failed (four noun pronunciations and four
  unrelated header notes), 8 passed.
- After the fix and additional boundary cases: 87 scraper/ingestion unit tests
  passed using `.venv/bin/pytest packages/scraper/tests packages/ingestion/tests/unit -q`.
- Compared every output field from old/new parsers on all 14,449 saved source
  articles. Exactly four articles / five meanings changed from verb to noun:
  `bewustzijn` (two meanings), `bijzijn`, `islam`, `welzijn`.
- `islam` also loses fabricated verb forms `de islamiet, ;, islamitisch`.
- No other output fields changed, including definitions, examples, source
  identity, and real verb conjugation data. No NT2 articles changed.
- [Machine-readable evidence](corpus-diff.json) records source/parser hashes,
  baseline commit, every delta, and run duration. This is a bounded regression
  comparison, not proof that every pre-existing POS label is correct.

Reproduce from the repository root with the worktree's own Python environment:

```sh
.venv/bin/python docs/research/vandale-pos-inference-2026-09-26/compare_parsers.py \
  --source /path/to/saved/word_list.json \
  --output /tmp/vandale-pos-diff.json
```

## Delivery boundary

This changes parser code and tests only. The saved source corpus and generated
artifacts were read, not overwritten; production was neither queried nor updated.
Applying the corrections to stored entries requires a separate versioned artifact
regeneration and the existing source-reconciliation import path. Preserve stable
provider/sense keys and inspect the import plan before applying it; do not insert
new words based on changed filenames or rewrite learning history. Broad POS
confidence-policy changes and the 22 existing empty POS entries are outside this
focused correction.
