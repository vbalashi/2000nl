# US-041-3 Static File Serving Notes

## Next.js config (dev machine)
- `apps/ui/next.config.js` sets `output: 'standalone'` and does not override static file handling.
- No custom rewrites or asset prefix configured.

## Public directory behavior
- **Dev (`next dev`)**: Files under `apps/ui/public` are served at the site root (e.g., `public/audio/...` -> `/audio/...`). Next watches the filesystem; symlinks (like `public/audio -> db/audio`) are resolved by the local OS.
- **Prod (`next build` + `next start`)**: Files under `public` are still served at the site root by the Next.js server. With `output: 'standalone'`, the deployment must include both `public/` and `.next/static/` alongside the standalone server output; otherwise static assets can 404.

## NUC reverse proxy check
- `/etc/nginx/sites-available/2000nl` does not exist on the NUC host.
- `/etc/nginx` is not present on the NUC host; `nginx` is not in PATH.
- `ps` shows `nginx` processes, which suggests an embedded/containerized nginx or a non-standard install. I could not locate a host-level nginx config to confirm any `/audio` location blocks.

## Dev vs prod differences observed
- **Localhost (dev)**: Sentence audio (TTS via `/api/tts`) works; word audio from `/audio/nl/...` has 404s.
- **NUC (prod)**: Word audio from `/audio/nl/...` works; sentence audio via `/api/tts` has 404s.

## Implications
- In dev, the `/public/audio` symlink is resolved locally, so missing word audio suggests path or file availability issues.
- In prod, static files rely on the deployment including `public/` and/or a host mount for `/audio/`. If the container lacks the mount, `/audio` may partially fail even if Next.js is configured correctly.
