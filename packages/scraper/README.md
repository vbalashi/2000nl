# packages/scraper

Scraping/parsing toolkit with source-specific adapters. The active Van Dale path currently exposes `vandale_html_parser.py`, which is used by ingestion processing to turn saved Van Dale HTML snippets into structured word-entry JSON.

Contract:
- Keep adapters isolated from UI/runtime code.
- Preserve the structured JSON shape consumed by `packages/ingestion/scripts/process_raw_words.py` and the downstream importer.
- If a future scraper writes a new raw-artifact layout, document the source directory and update ingestion docs/scripts at the same time.

## Van Dale `f0c` classification

Van Dale uses `span.f0c` both for explained expressions and, in one observed
layout, for bare examples. The parser classifies an `f0c` block as a meaning
example only when all of these source facts hold:

- the nearest preceding sibling section link is labelled `voorbeelden`;
- the block contains a nonblank `f3i` expression;
- it contains neither an `f3n` explanation nor a nested `f2s` example.

All other populated `f0c` blocks retain idiom/expression ownership, and a
meaning containing only classified examples is retained. Run
`packages/ingestion/scripts/audit_vandale_classification.py` against a complete
versioned manifest before changing this rule or regenerating artifacts.
