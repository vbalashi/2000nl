# packages/scraper

Scraping/parsing toolkit with source-specific adapters. The active Van Dale path currently exposes `vandale_html_parser.py`, which is used by ingestion processing to turn saved Van Dale HTML snippets into structured word-entry JSON.

Contract:
- Keep adapters isolated from UI/runtime code.
- Preserve the structured JSON shape consumed by `packages/ingestion/scripts/process_raw_words.py` and the downstream importer.
- If a future scraper writes a new raw-artifact layout, document the source directory and update ingestion docs/scripts at the same time.

## Downloading saved Van Dale images

The parsed artifacts already contain the original Van Dale CDN URLs in each
entry's `images` array. Preview what the downloader finds without writing any
files:

```bash
python3 packages/scraper/download_vandale_images.py --dry-run --limit 10
```

Download the complete set with the default paths:

```bash
python3 packages/scraper/download_vandale_images.py
```

By default the command reads `db/data/words_content`, writes PNG files to
`db/data/vandale_images`, and uses four concurrent requests. Both directories
are local generated data and are ignored by Git. The output also includes
`manifest.json`, which maps each local filename back to its source URL, card
artifacts, and headwords and records the byte size and SHA-256 digest.

The command is resumable: an existing valid PNG is hashed and recorded without
being downloaded again. Use `--overwrite` to fetch existing files again,
`--workers N` to change concurrency, and `--limit N` for a small trial. A
failed download is recorded in the manifest and makes the command exit with a
non-zero status, so rerunning the same command safely retries it.
