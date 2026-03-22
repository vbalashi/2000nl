# Audio download script

Downloads VanDale audio files referenced by the word data and stores them under `db/audio`.

## Prerequisites

- Python with `requests` installed.
- Valid VanDale OAuth token support via `/home/khrustal/dev/2000nl/auth_vandale.py`.

## Usage

```bash
./scripts/download-audio.py
```

Optional flags:

```bash
./scripts/download-audio.py \
  --rate 1.0 \
  --workers 1 \
  --limit 20 \
  --lang both \
  --order interleave \
  --rate-mode global \
  --audio-base https://assets.vandale.nl/audio \
  --audio-version 1_0 \
  --output-dir /home/khrustal/dev/2000nl-ui/db/audio
```

## Notes

- The script skips files that already exist on disk.
- Use `--tui` (default) for a progress bar, or `--no-tui` for plain logs.
- Errors are logged to `db/audio/errors.jsonl`.
- Downloaded files are stored as `db/audio/<lang>/<letter>/<hash>.mp3`.
- The UI serves audio via the `apps/ui/public/audio` symlink, so word data should use `/audio/<lang>/<letter>/<hash>.mp3` URLs.
- Use `--priority-nt2` to download only the NT2-2000 entries first.
- For faster runs, use `--workers` with `--rate-mode per-worker` and a lower `--rate`.
