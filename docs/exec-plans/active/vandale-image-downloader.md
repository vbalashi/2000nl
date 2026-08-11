# Van Dale NT2 Image Downloader

Status: active
Work reference: `vandale-image-downloader-2026-08-11`
Owner: Codex worktree `codex/vandale-image-downloader`
Started: 2026-08-11

## Objective

Add a resumable command that discovers the image URLs already stored in the
local Van Dale NT2 JSON artifacts and downloads the referenced assets without
changing the parsed dictionary data.

## Claimed scope

- `packages/scraper/download_vandale_images.py`
- `packages/scraper/tests/test_download_vandale_images.py`
- `packages/scraper/README.md`
- this execution plan

The generated corpus under `db/data/` is read-only input and remains ignored by
Git. UI, ingestion contracts, database state, and production are out of scope.

## Public test seam

The command-line interface is the public seam: a directory of parsed JSON
artifacts goes in; downloaded image files and a manifest come out. Tests cover
URL discovery/deduplication, host validation, successful downloads, and
resuming without downloading existing files again.

## Progress

- 2026-08-11: read workspace and repository policy, inspected active worktrees
  and overlapping Van Dale branches, and created an isolated worktree from
  `origin/main`.
- 2026-08-11: inspected `db/data/words_content`; found 622 unique PNG URLs on
  `assets.vandale.nl` and verified a representative asset returns HTTP 200.
- 2026-08-11: implemented the resumable downloader and manifest, with URL/path
  validation, bounded concurrency, atomic file writes, PNG validation, hashes,
  trial limits, and explicit failure records.
- 2026-08-11: downloaded two real CDN assets into a temporary directory and
  verified that a second run reused both files. All 24 scraper tests pass.
