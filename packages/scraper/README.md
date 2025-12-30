# packages/scraper

Scraping toolkit with per-dictionary adapters. Emits raw note artifacts validated against shared language templates.

Contract:
- Output directory: `data/raw/<dictionary>/<lang>/<YYYYMMDD>/` containing `headword.json` files.
- Shape: must match `packages/shared/schemas/<lang>/note.schema.json` plus dictionary metadata/version.
- Keep adapters isolated from ingestion; ingestion consumes artifacts via file system or storage bucket.
