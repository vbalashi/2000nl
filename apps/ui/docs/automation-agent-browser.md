# Browser Automation (agent-browser)

This doc is for running quick UI smoke checks with `agent-browser` in both desktop and mobile viewports, without getting stuck on Supabase OTP auth.

Current preferred local QA path: use the repo wrappers from the 2000NL root so
the UI process points at the local Supabase stack instead of any production or
staging values in `.env.local`.

```bash
scripts/db-local-supabase.sh all
scripts/ui-local-dev.sh --port 3100
curl -sS 'http://localhost:3100/api/health?deep=1'
```

Expected health gate:

```json
{ "status": "ok", "database": { "target": "local" } }
```

Then open:

- `http://localhost:3100/dev/test-login?redirectTo=/`

Use `localhost:3100` in the examples below when running the canonical local QA
server. Older `127.0.0.1:3000` examples are useful only when you deliberately
started the app on that exact origin.

Recommended approach: use a persistent `agent-browser --profile ...` directory and inject a freshly-minted Supabase session JSON into `localStorage` once. After that, the profile keeps you logged in across runs.

For production auth injection (https://2000.dilum.io), see `docs/runbooks/production-login.md`.

## Prerequisites

1. Local dev server is running through the wrapper:
   ```bash
   scripts/db-local-supabase.sh start
   scripts/db-local-supabase.sh apply
   scripts/db-local-supabase.sh probe
   scripts/ui-local-dev.sh --port 3100
   ```

2. Server-side env vars exist in `apps/ui/.env.local` (gitignored):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` (server only, never client-side)
   - `QA_TEST_USER_EMAIL` and `QA_TEST_USER_EMAIL_ALLOWLIST` (the dedicated automation identity)

## Dev Login (No Manual OTP)

Open:

- `http://localhost:3100/dev/test-login?redirectTo=/`

Use the same host and port as the app under test. For example, if the UI runs on
an alternate port, open that same origin:

- `http://localhost:<port>/dev/test-login?redirectTo=/`

What it does:
- `GET /api/dev/test-session` (dev-only) uses the local wrapper's exact allowlisted QA identity and requires its server-read QA marker before generating an OTP.
- It then exchanges the OTP for a real Supabase session and stores the session JSON in `localStorage` (Supabase format).

If this flow is flaky in headless automation (token rotation / Strict Mode timing), use the deterministic injection flow below.

## Persistent Profile (Recommended)

Use a single profile directory for local automation:

- `tmp/agent-browser/profile-2000nl-local`

Notes:
- `--profile` only applies when the agent-browser daemon starts. If you see `--profile ignored: daemon already running`, run `agent-browser close` and retry.
- Never commit anything under `tmp/`.
- Supabase auth is origin-scoped. A session injected into `http://localhost:3100` does not apply to `https://2000.dilum.io` and vice versa.

## Deterministic local login

Use the dev-only `/dev/test-login` flow created by `scripts/ui-local-dev.sh`.
It applies the same allowlist, reference-identity, durable-marker, and exact
principal checks as the production helper. Do not mint or copy raw Supabase
session JSON with an inline script.

## Production smoke

Do not reuse the local injection snippet or a human-owned browser session in
production. The production wrapper enforces the explicit allowlist, reference
identity deny-list, durable QA marker, and exact post-exchange principal. It
also revokes the session and removes token artifacts when it exits:

```bash
scripts/ab-auth-prod.sh
```

Keep production smoke read-only unless the owning issue explicitly authorizes a
mutation. See `docs/runbooks/production-login.md` for the full safety contract.

## Desktop Run (Example)

```bash
outdir="tmp/agent-browser-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$outdir"

agent-browser --session ab-desktop set viewport 1440 900
agent-browser --session ab-desktop --profile tmp/agent-browser/profile-2000nl-local open "http://localhost:3100/"
agent-browser --session ab-desktop wait --text "Antwoord Tonen"
agent-browser --session ab-desktop screenshot "$outdir/desktop-01.png"

# Reveal + grade a few cards
agent-browser --session ab-desktop press Space
agent-browser --session ab-desktop press K
agent-browser --session ab-desktop press Space
agent-browser --session ab-desktop press K
agent-browser --session ab-desktop screenshot "$outdir/desktop-02.png"
```

## Mobile Run (Example)

```bash
outdir="tmp/agent-browser-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$outdir"

agent-browser --session ab-mobile set viewport 390 844
agent-browser --session ab-mobile --profile tmp/agent-browser/profile-2000nl-local open "http://localhost:3100/"
agent-browser --session ab-mobile wait --text "Antwoord Tonen"
agent-browser --session ab-mobile screenshot "$outdir/mobile-01.png"

agent-browser --session ab-mobile press Space
# First-time cards may show "Begin met leren" instead of grade buttons
agent-browser --session ab-mobile find role button click --name "Begin met leren" || true
agent-browser --session ab-mobile find role button click --name "Goed" || true
agent-browser --session ab-mobile press K
agent-browser --session ab-mobile screenshot "$outdir/mobile-02.png"
```

## Session Persistence (Skip /dev/test-login Next Time)

Supabase persists its session in `localStorage`. Whether that survives across `agent-browser` runs depends on how you launch it:

- If you launch a fresh, ephemeral browser each time, you'll need to log in again.
- To persist auth, use one of these:

1. Save/load state:
   ```bash
   # After you've logged in once
   agent-browser state save tmp/ab-auth.json

   # Next run (state must be loaded at launch)
   agent-browser --state tmp/ab-auth.json open http://localhost:3100/
   ```

2. Use a persistent profile directory:
   ```bash
   agent-browser --profile tmp/agent-browser/profile-2000nl-local open http://localhost:3100/dev/test-login?redirectTo=/
   # Next time, reuse the same profile:
   agent-browser --profile tmp/agent-browser/profile-2000nl-local open http://localhost:3100/
   ```

Notes:
- Sessions expire like any other Supabase session. If the tokens are expired, the app will prompt for auth again.
- If you see auth failures after a while, re-run `/dev/test-login` and re-save state.

## Troubleshooting

If `http://localhost:3100/dev/test-login` shows an error:

- `SUPABASE_SERVICE_ROLE_KEY is required...`
  - `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` is missing from `apps/ui/.env.local`, or the dev server wasn't restarted after editing env.
- `Token has expired or is invalid`
  - `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` is wrong for the project, or was rotated.
- `Email link is invalid or has expired` / `Token has expired or is invalid` from `verifyOtp`
  - Check that Auth is configured for **email OTP** and that `QA_TEST_USER_EMAIL` exists with the required QA marker.

Noise in console during automation:
- `get_last_review_debug` missing:
  - This is an optional debug RPC; if the DB doesn't expose it publicly, the app will skip it silently.
- `Failed to load resource: 404`:
  - Often a missing local asset (favicon, etc.). Only investigate if it impacts the UI flow.
