# PWA Implementation Assessment - 2000nl
Date: 2026-01-23

## Executive summary
- PWA installability is straightforward in Next.js App Router by adding `app/manifest.ts` plus icons and HTTPS, but offline behavior requires a service worker and a caching plan. Minimal installable PWA is a 1-2 day effort.
- Full offline support for 2000nl is materially more complex (5+ days) because core training data is fetched from Supabase and dynamic API routes (translation + TTS) are network dependent.
- Recommended path: ship an installable PWA with a limited offline experience (app shell + recently used assets) using a maintained service worker toolchain (Serwist or the @ducanh2912/next-pwa fork), then evaluate deeper offline storage/sync in a later sprint.

## PWA fundamentals (baseline requirements)
- Installability requires a web app manifest and HTTPS (or localhost) for supported browsers. Service workers are optional for installability but are typically used to enable offline behavior.
- Next.js App Router supports `app/manifest.(json|ts)` for manifest generation; icons and metadata can be provided via Next.js metadata APIs.

## Current 2000nl dependencies that affect offline
- Training data and user state are read via Supabase client calls in `apps/ui/lib/trainingService.ts`.
- Translations are fetched through `/api/translation` (reads/writes to Supabase and calls external translation provider).
- Sentence audio uses `/api/tts` to generate and cache audio; word audio is served as static files under `/audio`.

Implication: Full offline training would require caching or re-implementing data access locally (IndexedDB or local SQLite + sync), plus storing translation overlays and audio. A limited offline experience can still cache app shell and the most recently accessed words/audio.

## Tooling options (App Router compatible)
1) Serwist (`@serwist/next`)
- Actively maintained, explicit support for Next.js integration, and a clear setup flow (manifest + service worker).
- Requires creating a service worker file and wiring it into Next.js config.

2) next-pwa fork (`@ducanh2912/next-pwa`)
- Forked successor to the archived `next-pwa` repo.
- Provides App Router support, offline fallbacks, and workbox-based runtime caching.
- Older `next-pwa` package on npm is stale and the original repo is archived, so use the maintained fork if choosing this path.

Recommendation: Prefer Serwist for a long-term maintained path. Use @ducanh2912/next-pwa only if the team wants the zero-config experience and accepts dependency risk.

## Proposed offline caching strategy (phased)
### Phase 1: Installable + app shell offline (short term)
- Precache static assets: Next.js build output, CSS/JS, icons, and base shell routes.
- Runtime caching:
  - `GET /audio/**`: cache-first with range request support, with size limits.
  - `GET /api/translation`: network-first, cache only successful results; short TTL.
  - `POST /api/tts`: network-only (generation requires server), but cache the resulting `/audio/tts/**` file for later replay.
- Offline fallback page for uncached routes (e.g., `/~offline` in App Router).

### Phase 2: Recent content offline (medium term)
- Cache the last N (e.g., 50-100) training items and their audio in IndexedDB.
- Cache translation overlays locally with timestamp/ETag to allow stale reads while offline.

### Phase 3: Full offline training + sync (long term)
- Local storage for word lists, SRS state, and review history.
- Background sync or manual sync queue once connectivity returns.
- Clear conflict resolution policies (last-write-wins or server authority).

## Complexity estimate
- Minimal installable PWA (manifest + icons + basic SW): 1-2 days.
- Limited offline (app shell + runtime caching + offline fallback): ~3-4 days.
- Full offline training + sync: 5+ days (likely 1-2 weeks depending on scope).

## Story points estimate (Sprint 10 implementation)
Total: 8 points
- 2 points: Manifest, icons, metadata, and installability validation.
- 3 points: Service worker integration + runtime caching + offline fallback page.
- 2 points: Cache audio + basic recent-content persistence (IndexedDB).
- 1 point: QA, Lighthouse checks, and regression testing across desktop/iOS/Android.

## Risks and blockers
- Supabase auth and RPC calls assume network availability; true offline requires local data models and sync.
- Translation and TTS are server-driven and may not be cacheable beyond prior results.
- iOS PWA behaviors differ (storage eviction, install UX), requiring additional testing.
- Cache size constraints for audio assets; need eviction rules to prevent storage bloat.

## Recommendation
Proceed with an installable PWA and limited offline support in Sprint 10 (8 points). Defer full offline training + sync until a dedicated sprint where data architecture and sync strategy can be designed deliberately.

## References
- Next.js App Router manifest documentation: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest
- Next.js PWA guide: https://nextjs.org/docs/app/guides/progressive-web-apps
- MDN installable PWA requirements: https://developer.mozilla.org/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
- MDN PWA overview: https://developer.mozilla.org/docs/Web/Progressive_web_apps/Guides/What_is_a_progressive_web_app
- web.dev service workers and caching: https://web.dev/learn/pwa/service-workers , https://web.dev/learn/pwa/caching
- Archived next-pwa repo: https://github.com/ImBIOS/next-pwa
- Maintained fork docs: https://ducanh-next-pwa.vercel.app/docs/next-pwa
- Serwist Next.js integration: https://serwist.pages.dev/docs/next
