# Premium Features: Translations & Audio

Reference for troubleshooting the LLM translation pipeline and premium TTS audio providers.

## Premium Translations (OpenAI GPT-5.2)

### Architecture

Translation uses a provider abstraction: `ITranslator` interface + factory in `apps/ui/lib/translation/translationProvider.ts`.

- **Default provider:** OpenAI (`TRANSLATION_PROVIDER=openai`)
- **Fallback:** DeepL (`TRANSLATION_FALLBACK=deepl`) — automatic if OpenAI fails
- **Model:** `gpt-5.2` (override with `OPENAI_MODEL`)

The translation API route (`apps/ui/app/api/translation/route.ts`) handles caching, fingerprinting, and provider selection.

### Env vars

```
TRANSLATION_PROVIDER=openai          # openai | deepl | gemini
TRANSLATION_FALLBACK=deepl           # optional automatic fallback
OPENAI_API_KEY=sk-...                # required for openai provider
OPENAI_MODEL=gpt-5.2                 # optional, defaults to gpt-5.2
DEEPL_API_KEY=...                    # required only if deepl is provider or fallback
```

### Fingerprint-based cache invalidation

Each translation row in `word_entry_translations` has a `source_fingerprint` computed from:
- Word definition items (path + text)
- `word_entries.part_of_speech` (POS code like `zn`, `ww`, `bn`)
- `TRANSLATION_PIPELINE_VERSION` constant (currently `"note_v1"`)

When any of these change, the fingerprint mismatches and the translation is **re-generated on next card view** — no manual deletion needed.

**Key constant:** `TRANSLATION_PIPELINE_VERSION` in `apps/ui/app/api/translation/route.ts`. Bump this to force re-translation of all cached entries.

### POS codes

Dutch POS tags stored on `word_entries.part_of_speech`:

| Code | Dutch label | English |
|------|-------------|---------|
| zn | zelfstandig naamwoord | noun |
| ww | werkwoord | verb |
| bn | bijvoeglijk naamwoord | adjective |
| bw | bijwoord | adverb |
| vz | voorzetsel | preposition |
| vw | voegwoord | conjunction |
| tw | telwoord | numeral |
| vnw | voornaamwoord | pronoun |

Mapping is in `POS_DUTCH_LABELS` in the translation route.

### Translation note field

The OpenAI prompt requests a brief contextual `note` (1-2 sentences) about common meaning vs example-specific meaning. Stored in `word_entry_translations.note`. Not displayed in card UI yet — saved for future use.

**Migration:** `db/migrations/008_translation_note.sql` (adds `note text` column)

### Troubleshooting translations

| Symptom | Check |
|---------|-------|
| Translation not updating | Compare `source_fingerprint` in DB vs computed fingerprint. Check `TRANSLATION_PIPELINE_VERSION`. |
| OpenAI errors | Verify `OPENAI_API_KEY` is set and valid. Check API quota. Look for error in `word_entry_translations.error_message`. |
| Fallback to DeepL silently | Check server logs for OpenAI failures. `TRANSLATION_FALLBACK=deepl` triggers on any OpenAI error. |
| POS not included | Check `word_entries.part_of_speech` for the word — may be NULL. |
| Old translations persist | Fingerprint should auto-invalidate. If not, check that `TRANSLATION_PIPELINE_VERSION` matches what's in code. |
| `note` is NULL | Old cached rows before `note_v1` — will backfill on next card view when fingerprint mismatches. |

**DB queries:**
```sql
-- Check a specific translation
select word_entry_id, provider, status, source_fingerprint, note, error_message
from word_entry_translations
where word_entry_id = '<uuid>' and target_lang = 'ru';

-- Count translations by status
select status, count(*) from word_entry_translations group by status;

-- Find stuck/errored translations
select * from word_entry_translations where status in ('pending', 'error') limit 20;
```

---

## Premium Audio (Google Cloud TTS / Azure TTS)

### Architecture

Audio uses a provider abstraction mirroring translations: `IAudioProvider` interface + `AudioProviderFactory` in `apps/ui/lib/audio/`.

```
apps/ui/lib/audio/
├── audioProvider.ts              # IAudioProvider interface
├── audioProviderFactory.ts       # createAudioProvider() factory
├── types.ts                      # AudioQuality, PremiumAudioProviderId
└── providers/
    ├── freeAudioProvider.ts      # Wraps existing free TTS (default)
    ├── googleCloudTtsProvider.ts # Google Cloud Text-to-Speech
    └── azureTtsProvider.ts       # Azure Cognitive Services TTS
```

The TTS API route (`apps/ui/app/api/tts/route.ts`) calls `createAudioProvider()` and caches mp3 output on disk.

### Env vars — provider selection

```
AUDIO_QUALITY_DEFAULT=free           # free | premium (server-wide default)
PREMIUM_AUDIO_PROVIDER=google        # google | azure (which premium backend)
```

Notes:
- The UI needs a client-side default too (otherwise it can hard-default to `free` and always send `quality=free`).
- `NEXT_PUBLIC_AUDIO_QUALITY_DEFAULT` is injected at build time from `AUDIO_QUALITY_DEFAULT` (see `apps/ui/next.config.js`).

### Env vars — Google Cloud TTS

```
GOOGLE_TTS_API_KEY=AIza...                          # API key auth
# OR
GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json     # Service account auth
```

Uses Dutch voices (`nl-NL`). Voice selection falls back gracefully if a specific voice name is unavailable.

### Env vars — Azure TTS

```
AZURE_SPEECH_KEY=your-key
AZURE_SPEECH_REGION=westeurope
# OR
AZURE_TTS_ENDPOINT=https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1
```

Optional overrides:
```
AZURE_TTS_VOICE_PREMIUM=nl-NL-FennaNeural   # default voice
AZURE_TTS_OUTPUT_FORMAT=audio-48khz-192kbitrate-mono-mp3
AZURE_TTS_USER_AGENT=2000nl-ui
```

Default voice: `nl-NL-FennaNeural`. Fallback voices: `nl-NL-MaartenNeural`, `nl-NL-ColetteNeural`.

### User setting

Users toggle audio quality in Settings UI ("Audio kwaliteit": Free / Premium). Stored in `user_settings.audio_quality` (`free` or `premium`).

**Migration:** `db/migrations/009_audio_quality_setting.sql`

The `/api/tts` route receives `quality` parameter from the client. Cache keys include quality + provider ID so free and premium audio never collide.

### TTS cache layout

Cache dir: `TTS_CACHE_DIR` env var (default: `/tmp/2000nl-tts-cache`)

Files stored in hash-based subdirs: `<cache_dir>/<first2chars>/<cacheKey>.mp3`

Backward compatible — legacy flat files are served and lazily migrated on access.

Bulk migration script: `node apps/ui/scripts/migrate-tts-cache.js`

### Troubleshooting audio

| Symptom | Check |
|---------|-------|
| No premium audio, still plays free | Check `PREMIUM_AUDIO_PROVIDER` and corresponding API key env vars are set. Restart server after adding env vars. Check user's `audio_quality` setting in DB. |
| Google TTS error | Verify `GOOGLE_TTS_API_KEY` or `GOOGLE_APPLICATION_CREDENTIALS`. Check Google Cloud project has Text-to-Speech API enabled. |
| Azure TTS error | Verify `AZURE_SPEECH_KEY` + `AZURE_SPEECH_REGION`. Check Azure portal for Speech Services resource status. |
| Wrong audio cached (free plays as premium or vice versa) | Cache key includes quality + provider. Clear cache dir or check that `/api/tts` receives the `quality` param from client. |
| 404 on audio files | Check `TTS_CACHE_DIR` exists and is writable. Check both flat and nested paths. |
| Premium indicator not showing in UI | Check `user_settings.audio_quality = 'premium'` in DB. Check `TrainingScreen.tsx` header indicator logic. |

**DB queries:**
```sql
-- Check user's audio setting
select user_id, audio_quality from user_settings where user_id = '<uuid>';

-- Update a user to premium (manual override)
update user_settings set audio_quality = 'premium' where user_id = '<uuid>';
```

**Server logs:** The `/api/tts` route logs provider selection and errors. On failure with premium configured, check for `"Azure TTS is not configured"` or `"Google TTS is not configured"` error messages in the response body.

---

## Key files

| Purpose | Path |
|---------|------|
| Translation route (cache + provider) | `apps/ui/app/api/translation/route.ts` |
| Translation provider factory | `apps/ui/lib/translation/translationProvider.ts` |
| OpenAI translator | `apps/ui/lib/translation/openaiTranslator.ts` |
| TTS route (cache + provider) | `apps/ui/app/api/tts/route.ts` |
| Audio provider factory | `apps/ui/lib/audio/audioProviderFactory.ts` |
| Google TTS provider | `apps/ui/lib/audio/providers/googleCloudTtsProvider.ts` |
| Azure TTS provider | `apps/ui/lib/audio/providers/azureTtsProvider.ts` |
| Settings UI (audio toggle) | `apps/ui/components/training/SettingsModal.tsx` |
| Migration: translation note | `db/migrations/008_translation_note.sql` |
| Migration: audio quality | `db/migrations/009_audio_quality_setting.sql` |
| Bulk TTS cache migrator | `apps/ui/scripts/migrate-tts-cache.js` |
| Bulk re-translate script | `apps/ui/scripts/retranslate-translations.js` |
