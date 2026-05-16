# Premium Features: Audio

## Architecture

Audio uses `IAudioProvider` and `AudioProviderFactory` in `apps/ui/lib/audio/`.

Key layout:
```text
apps/ui/lib/audio/
├── audioProvider.ts
├── audioProviderFactory.ts
├── types.ts
└── providers/
```

The route `apps/ui/app/api/tts/route.ts` chooses the provider and caches MP3 output.

## Env Vars: Provider Selection

```text
AUDIO_QUALITY_DEFAULT=free
PREMIUM_AUDIO_PROVIDER=google
```

Client-side default is passed through `NEXT_PUBLIC_AUDIO_QUALITY_DEFAULT`.

## Env Vars: Google Cloud TTS

```text
GOOGLE_TTS_API_KEY=AIza...
GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json
```

## Env Vars: Azure TTS

```text
AZURE_SPEECH_KEY=your-key
AZURE_SPEECH_REGION=westeurope
AZURE_TTS_ENDPOINT=https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1
AZURE_TTS_VOICE_PREMIUM=nl-NL-FennaNeural
AZURE_TTS_OUTPUT_FORMAT=audio-48khz-192kbitrate-mono-mp3
AZURE_TTS_USER_AGENT=2000nl-ui
```

## User Setting

Users choose `free` or `premium` audio in Settings. The value is stored in `user_settings.audio_quality`.

## TTS Cache Layout

`TTS_CACHE_DIR` defaults to `/tmp/2000nl-tts-cache`.

Files live under:
```text
<cache_dir>/<first2chars>/<cacheKey>.mp3
```

Legacy flat files are still served and lazily migrated. Bulk migration script:
- `node apps/ui/scripts/migrate-tts-cache.js`

## Troubleshooting

| Symptom | Check |
|---|---|
| Premium audio still plays as free | Verify provider env vars and `user_settings.audio_quality` |
| Google TTS error | Verify credentials and API enablement |
| Azure TTS error | Verify key, region, or endpoint |
| Wrong cache variant | Check `quality` parameter and cache key composition |
| 404 on audio files | Check `TTS_CACHE_DIR` exists and is writable |
| Premium indicator missing | Check DB setting and UI indicator logic |

## DB Queries

```sql
select user_id, audio_quality from user_settings where user_id = '<uuid>';

update user_settings set audio_quality = 'premium' where user_id = '<uuid>';
```

## Key Files

| Purpose | Path |
|---|---|
| TTS route | `apps/ui/app/api/tts/route.ts` |
| Audio provider factory | `apps/ui/lib/audio/audioProviderFactory.ts` |
| Google TTS provider | `apps/ui/lib/audio/providers/googleCloudTtsProvider.ts` |
| Azure TTS provider | `apps/ui/lib/audio/providers/azureTtsProvider.ts` |
| Settings UI | `apps/ui/components/training/SettingsModal.tsx` |
| Bulk cache migrator | `apps/ui/scripts/migrate-tts-cache.js` |
