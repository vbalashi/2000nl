# Audio File Serving

The 2000nl app serves Dutch word pronunciation audio files via the Next.js public folder.

## Architecture

```
db/audio/                    <- Audio files stored here
  ├── nl/                    <- Dutch pronunciation (Netherlands)
  │   ├── a/
  │   ├── b/
  │   └── ...
  └── be/                    <- Dutch pronunciation (Belgium)
      ├── a/
      ├── b/
      └── ...

apps/ui/public/audio         <- Symlink to db/audio
```

## File Format

Audio files are stored as MP3 files with Base64-encoded hashes as filenames:
- Format: `<lang>/<letter>/<base64-hash>.mp3`
- Example: `nl/v/XSnYshTZU+ruTokh+miJeQ.mp3`

## Word Data URLs

Word JSON files contain audio URLs in the `audio_links` field:

```json
{
  "headword": "vertrekken",
  "audio_links": {
    "nl": "/audio/nl/v/XSnYshTZU+ruTokh+miJeQ.mp3",
    "be": "/audio/be/v/t4J0nkM-gmzD6t6baXHTxg.mp3"
  }
}
```

## Frontend Usage

For MVP, the frontend uses **Dutch (nl) pronunciation only**:

```typescript
const audioUrl = word.audio_links?.nl;
if (audioUrl) {
  playAudio(audioUrl);
}
```

Belgian (be) pronunciation will be added later as a user preference.

## HTTP Access

Audio files are accessible via HTTP in development and production:

**Development:**
- URL: `http://localhost:3000/audio/nl/v/<hash>.mp3`
- Next.js serves files from `public/audio/` via the symlink

**Production (NUC deployment):**
- URL: `https://2000nl.khrustal.nl/audio/nl/v/<hash>.mp3`
- Same symlink approach works in production

## Setup

The symlink is created at `apps/ui/public/audio`:

```bash
cd apps/ui/public
ln -s ../../db/audio audio
```

This symlink is relative and portable - it works in both development and production without modification.

## URL Migration

Audio URLs in word data were migrated from placeholder URLs to proper Next.js public folder URLs:

```bash
# Before: http://spraak/nl/v/hash
# After:  /audio/nl/v/hash.mp3
```

Migration script: `scripts/update-audio-urls.py`

## Storage

- **Files:** 4,330 MP3 files (2,078 nl + 2,252 be)
- **Size:** 109 MB total
- **Location:** `/home/khrustal/dev/2000nl-ui/db/audio/`

## Testing

Verify audio serving:

```bash
# Start dev server
cd apps/ui && npm run dev

# Test audio file via curl
curl -I http://localhost:3000/audio/nl/v/XSnYshTZU+ruTokh+miJeQ.mp3

# Expected response:
# HTTP/1.1 200 OK
# Content-Type: audio/mpeg
```

Or visit the URL directly in a browser to see the audio player.
