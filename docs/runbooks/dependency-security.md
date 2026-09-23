# Production dependency security

Owner: 2000NL maintainers. Tracking: [#411](https://github.com/vbalashi/2000nl/issues/411).

Run `node scripts/check-dependency-security.mjs` from the repository root after
installing the UI lockfile. CI runs it on every PR, main push, and weekly. Registry
errors and malformed reports fail closed. All production high/critical findings
block. Low/moderate findings remain visible and require applicability review.
Branch protection is separately owned by #414; the workflow itself cannot enforce merging.

There are **no production exceptions**. Do not add `continue-on-error`, ignore all
findings in a package, or weaken the threshold. If an unavoidable finding needs an
exception, propose a separate reviewed PR with exact advisory ID, installed version,
exposure evidence, compensating measure, named owner, tracking issue and expiry no
more than 30 days away. That PR must implement and test expiry enforcement before
any suppression is enabled. An issue comment alone cannot bypass this gate.

## September 2026 upgrade

[Baseline advisories](../security/dependency-audit-2026-09-22.md): 11 production
packages (2 critical, 7 high, 1 moderate, 1 low). Updated lockfile audit: zero.
Next 14.2.0 → 15.5.26, matching eslint-config-next; React remains 18.3.1.
Next 15 is [Maintenance LTS](https://nextjs.org/support-policy); Next 14 is unsupported.
Review the move to the current active LTS **by 2026-10-01**, before Next15 reaches
its two-year support boundary on 2026-10-21. Owner: 2000NL maintainers (#411).
This deliberately small bridge avoids imposing a wider framework migration on UX work.

Next's pinned PostCSS is overridden within Next only to a patched 8.5 release;
remove the override once the upstream dependency no longer needs it. Google TTS
transport/protobuf, Supabase websocket and glob/nanoid transitives were refreshed
within compatible ranges. Joyride 3.2 replaces v2's removed ReactDOM APIs required
by Next's App Router runtime. Its migration is mechanical: named component,
`onEvent`, options and button styling; tour content and completion persistence stay.
Route params and the dev-only gate's search params now await the Next15 promises.

### Applicability

- App Router/RSC and server request handling are present: framework DoS fixes
  take priority even without evidence of successful exploitation.
- No middleware authorization file, Server Actions, `next/image` use or custom
  remote image patterns were found. Corresponding bypass/image advisories are
  configuration-dependent; they are patched anyway, not suppressed.
- Protobuf/gRPC are used for outbound Google TTS with provider-owned schemas;
  no public gRPC server or user-uploaded protobuf schemas were found. Malformed
  upstream response advisories still warrant updates.
- Websocket dependencies belong to Supabase; hostile upstream/fragment conditions
  are not equivalent to an unauthenticated local websocket server.
- Glob CLI injection is not called by request handlers. Glob/minimatch/brace and
  PostCSS process project inputs during builds; repository trust still matters.
  No untrusted CSS processing or request-supplied nanoid sizes were found.

Full (including development) audit still reports four packages: Vitest critical,
Vite high, vite-node and esbuild moderate. They are test/dev tooling, omitted from
production audit and standalone runtime. Do not expose Vitest UI/API or Vite dev
servers to untrusted networks. They need a separate Vitest major upgrade review;
owner: 2000NL maintainers, follow-up in #411, review by 2026-10-01. This is not a
production exception and zero production findings does not mean zero dev findings.

## Deployment and rollback

No DB contract or environment-key changes. Build with the existing Node22 Docker
recipe and clean `npm ci`; never reuse Next14 build output. Validate standalone
`server.js`, static assets, auth entry and Training before promoting the image.
Next15 changes default GET caching; sensitive API handlers already return no-store
and/or force dynamic rendering. Re-exported route-config build warnings remain;
GET default is uncached in Next15. Review cache behavior in any later route work.

Rollback uses the previous immutable UI image and requires no DB rollback, but
restores known vulnerable dependencies: keep that emergency window short and track
it in #411. This PR neither deploys nor changes the rollout hold.

### Validation of this change

- Fresh production audit: 0 findings; checker tests: 4 passed, including malformed
  reports and inconsistent severity counters.
- Typecheck and lint pass (one pre-existing exhaustive-deps warning).
- Unit/API suite: 1,021 passed, 220 DB-dependent tests skipped; no DB behavior changed.
- Focused Playwright: 3 passed (Training answer/details and Library desktop/mobile),
  using the repository fake Supabase session/request fixtures, not a real backend.
- Full production build completed. Standalone boot served login and JS assets (200),
  rejected unauthenticated session access (401), health endpoint returned 200; no
  browser page errors. Uses local dummy Supabase configuration, not real OTP login.
- Ephemeral browser fixture using the real onboarding hook and Joyride3 passed
  start, skip, restart, next and finish; completion persisted through mocked HTTP.
  The existing Training screen currently has no reachable tour-start control;
  this validates compatibility, not an end-to-end product onboarding journey.
  Temporary fixture and process were removed.
- Local checks ran on Node26; CI validates Node20 UI tests and Node22 security check.
  Docker remains Node22. No production environment was changed.
