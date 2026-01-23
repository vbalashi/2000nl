# US-041-1 Audio Investigation Notes

## Localhost (dev machine)
- `apps/ui/public/audio` is a symlink to `/home/khrustal/dev/2000nl-ui/db/audio`.
- `/home/khrustal/dev/2000nl-ui/db/audio` currently contains only `tts/` (no `nl/` word audio directory).
- TTS cache route writes to `db/audio/tts` and returns `/audio/tts/<hash>.mp3`.

## NUC host
- Live stack lives in `/srv/2000nl-ui`.
- Host audio store: `/srv/2000nl-ui/db/audio/` contains `nl/`, `be/`, and `tts/`.
- Docker compose for the UI service in `/srv/2000nl-ui/docker-compose.yml` has no volume mounts for `/srv/2000nl-ui/db/audio`.

## NUC container
- `docker exec 2000nl-ui-ui-1 ls -la /app/public` shows:
  - `/app/public/audio -> /home/khrustal/dev/2000nl-ui/db/audio`
- That symlink target does not exist inside the container (`/home/khrustal/dev/2000nl-ui/db/audio` is missing).
- Result: `/app/public/audio` resolves to a broken symlink inside the container; `/app/public/audio/nl` and `/app/public/audio/tts` are not present.

## Path generation in code
- `apps/ui/components/training/TrainingScreen.tsx` resolves word audio via `raw.audio_links?.nl` and plays it directly with `new Audio(audioUrl)`.
- `apps/ui/components/training/InteractiveText.tsx` does not build audio paths; it only forwards the clicked word and full sentence to the parent via `onWordClick`.
- `apps/ui/app/api/tts/route.ts` writes cached audio to `db/audio/tts` and returns `/audio/tts/<hash>.mp3`.

## Likely failure modes (based on filesystem inspection)
- **Localhost**: word audio likely 404s because there is no `db/audio/nl` on the dev machine; TTS likely works because `db/audio/tts` exists.
- **NUC**: word and sentence audio likely 404 inside the container because `/app/public/audio` points to a missing host path; host has `nl/` and `tts/` but container has no volume mount for `/srv/2000nl-ui/db/audio`.
