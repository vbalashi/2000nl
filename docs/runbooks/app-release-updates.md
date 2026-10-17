# App release updates (#299)

## Release metadata and editorial content

GET `/api/app-release` is a public, dynamic, no-store read of the existing
`appVersionInfo()` identity (version, commit, buildTimestamp). It does not read
user data or query the database. Keep the response and application image atomic.
The root page is now a server wrapper with force-dynamic; `app/HomePage.tsx`
preserves the existing client bootstrap. HTML must be no-store through the
public deployment proxy; hashed static assets remain cacheable.

`apps/ui/config/release-announcement.json` is `null` initially: no invented news
or unpublished blog links. To publish, replace null with an editorial object:

```json
{
  "id": "stable-release-story-id",
  "publishedAt": "2026-10-17T09:00:00Z",
  "locale": "en",
  "title": "A short title",
  "summary": "Two or three lines describing the user-visible change.",
  "detailsUrl": "https://example.invalid/blog/release-story"
}
```

The URL is illustrative and must be replaced with a real reviewed HTTPS link.
`detailsUrl` may be omitted. Supported editorial locale tags are en/ru/nl;
article text uses its language tag even when UI language differs. UI controls
are localized for all three interface languages. Title max100, summary max360,
id max100 and URL max2048 characters. Reject credentials in URLs; plain text
only. Review and commit content together with the release. Do not auto-publish
commit messages. A new id means a new unread story; preserving an id preserves
read status. Long-form content is hosted in the blog, outside this repository's
application boundary. There is no CMS or independent message push in this slice.

## Client behavior

Check after mount, focus, becoming visible and reconnecting; coalesce requests,
debounce background events for60s, poll visible tabs around5min with jitter and
failure backoff to15min. Network timeout5s. Checks never block app startup.
Dev builds with no valid full SHA/timestamp cannot claim update availability.

Settings keeps two existing header utilities, with a point if the document is
outdated OR the current story is unread. Opening Updates marks visible news read.
A banner offers Update app, Later and optional Read more; training defers it.
Later is remembered for that target build. News read state and banner dismissal
use account-namespaced local storage, with memory fallback; no cross-device sync.

Reload is manual and blocked during an active training surface/resumable run,
pending training actions or preparation. State comes from existing controller
and lifecycle, not DOM heuristics. The update preflight rechecks the server and
then performs document navigation, retaining destination/query/hash. A public
`_appRelease` URL marker lets the newly loaded document confirm its own identity
against the server. It is removed on success; failure never starts a reload loop.
Auth, resume records, cookies, IndexedDB and existing local data are not cleared.
This app ships no SW: an unexpected registration produces a recovery message
instead of blind unregister/cache deletion. This is a known recovery limitation
for historical installations, not a full offline-worker migration mechanism.

## Validation and rollout

Targeted Vitest: appRelease, appReleaseRoute, useAppRelease, releaseUpdatesUi,
HomePage.loading, approvedSettingsDestination, TrainingLibraryShell.
Browser states: `playwright/tests/release-updates.spec.ts`, desktop1440x1024,
phone390x844 light/dark, dismissal, settings, active training guard. These use
mocked auth/dictionary responses and deterministic announcement metadata.

Opt-in `release-updates-pair.spec.ts` owns port3100 exclusively and swaps two
production builds at `.next` and `.next-release-b`. Build A and B with distinct
existing NEXT_PUBLIC_APP_COMMIT, NEXT_PUBLIC_APP_VERSION and
NEXT_PUBLIC_BUILD_TIMESTAMP variables, fixed local
Supabase settings, and local font fixture. Build B with NEXT_DIST_DIR set to
`.next-release-b`. Run with RELEASE_PAIR_QA=1 and
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100. Do not run while another user/server
owns3100. The test checks real document/API updates and rollback; auth/learning
responses remain mocked. Separate Next output directories are local generated
artifacts, never shared between worktrees. Restore generated next-env/tsconfig
changes after the pair build. Keep one canonical QA server afterward.

Real installed Android/iOS PWA checks remain device-specific and must be
reported separately from browser viewport coverage. No DB migration is needed.
The first client release cannot retrofit monitoring into already-open older
code; those tabs need one manual reload. Confirm detection with a later release.
Check public root and release API headers and identity after deployment; do not
claim CDN behavior merely from localhost checks. Roll back image and its
metadata together. No mandatory-client-version protocol is introduced here.
