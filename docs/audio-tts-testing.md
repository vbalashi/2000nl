# Audio / Sentence Playback Testing

Production UI: https://2000.dilum.io

This app has two audio paths:

1. **Word audio** (dictionary pronunciation audio URL)
2. **Sentence audio** (TTS via `POST /api/tts`, then playback)

This doc focuses on sentence playback.

## Quick Manual Test (UI)

1. Log into `https://2000.dilum.io` (see `docs/production-login.md` for debugging-friendly login).
2. Toggle **Luistermodus actief** (headphones icon).
3. Enable **Tip (I)** so the example sentence becomes word-clickable.
4. Click any word inside an example sentence.

Expected:

- The client logs a click like:
  - `InteractiveText click: ...`
  - `Calling onWordClick ... sentence: <full sentence>`
- A request is made:
  - `POST https://2000.dilum.io/api/tts`
- The response includes a `url` field.
- Audio plays.

## Debug with `agent-browser` (Console + Trace)

```bash
cd /home/khrustal/dev/2000nl-ui

agent-browser --session prod2000 open https://2000.dilum.io/
agent-browser --session prod2000 wait --load networkidle

# Optional: inject session (see docs/production-login.md)

agent-browser --session prod2000 console --clear
agent-browser --session prod2000 errors --clear

# Start a trace so you can inspect failing network calls later
agent-browser --session prod2000 trace start

# Reproduce in the UI:
# - click the listen-mode toggle
# - click Tip (I)
# - click a word inside an example sentence

agent-browser --session prod2000 trace stop tmp/prod-audio-trace.zip
agent-browser --session prod2000 console
agent-browser --session prod2000 errors
```

## Common Failure Modes

### `POST /api/tts` returns 500

Check console for `[TTS] API error`.

Typical causes:

- Google TTS is not configured (`GOOGLE_APPLICATION_CREDENTIALS` or `GOOGLE_TTS_API_KEY` missing).
- The server cannot write to its cache directory.

### Filesystem is read-only in production

Do not assume `public/` is writable in production containers.

The recommended approach is:

- Cache mp3 files under a writable path (like `/tmp`).
- Serve cached audio via an API route.

## API Notes

- `POST /api/tts` expects JSON: `{ "text": "..." }`
- It returns JSON with `url` to play.
- The audio is served as `audio/mpeg`.
