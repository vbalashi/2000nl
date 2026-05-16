# packages/scraper

Scraping/parsing toolkit with source-specific adapters. The active Van Dale path currently exposes `vandale_html_parser.py`, which is used by ingestion processing to turn saved Van Dale HTML snippets into structured word-entry JSON.

Contract:
- Keep adapters isolated from UI/runtime code.
- Preserve the structured JSON shape consumed by `packages/ingestion/scripts/process_raw_words.py` and the downstream importer.
- If a future scraper writes a new raw-artifact layout, document the source directory and update ingestion docs/scripts at the same time.
