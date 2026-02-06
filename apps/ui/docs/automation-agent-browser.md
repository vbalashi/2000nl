# Browser Automation (agent-browser)

This doc is for running quick UI smoke checks with `agent-browser` in both desktop and mobile viewports, without getting stuck on Supabase OTP auth.

## Prerequisites

1. Local dev server is running:
   ```bash
   cd apps/ui
   npm run dev
   ```

2. Server-side env vars exist in `apps/ui/.env.local` (gitignored):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server only, never client-side)
   - `TEST_USER_EMAIL` (the automation user email)

## Dev Login (No Manual OTP)

Open:

- `http://127.0.0.1:3000/dev/test-login?redirectTo=/`

What it does:
- `GET /api/dev/test-session` (dev-only) uses `SUPABASE_SERVICE_ROLE_KEY` to generate an email OTP for `TEST_USER_EMAIL`.
- It then exchanges the OTP for a real Supabase session and stores it via `supabase.auth.setSession()` on the client.

## Desktop Run (Example)

```bash
outdir="tmp/agent-browser-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$outdir"

agent-browser --session ab-desktop set viewport 1440 900
agent-browser --session ab-desktop open "http://127.0.0.1:3000/dev/test-login?redirectTo=/"
agent-browser --session ab-desktop wait --url "**://127.0.0.1:3000/"
agent-browser --session ab-desktop wait --text "Antwoord"
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
agent-browser --session ab-mobile open "http://127.0.0.1:3000/dev/test-login?redirectTo=/"
agent-browser --session ab-mobile wait --url "**://127.0.0.1:3000/"
agent-browser --session ab-mobile wait --text "Antwoord"
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
   agent-browser --state tmp/ab-auth.json open http://127.0.0.1:3000/
   ```

2. Use a persistent profile directory:
   ```bash
   agent-browser --profile tmp/ab-profile open http://127.0.0.1:3000/dev/test-login?redirectTo=/
   # Next time, reuse the same profile:
   agent-browser --profile tmp/ab-profile open http://127.0.0.1:3000/
   ```

Notes:
- Sessions expire like any other Supabase session. If the tokens are expired, the app will prompt for auth again.
- If you see auth failures after a while, re-run `/dev/test-login` and re-save state.

## Troubleshooting

If `http://127.0.0.1:3000/dev/test-login` shows an error:

- `SUPABASE_SERVICE_ROLE_KEY is required...`
  - `SUPABASE_SERVICE_ROLE_KEY` is missing from `apps/ui/.env.local`, or the dev server wasn't restarted after editing env.
- `Token has expired or is invalid`
  - `SUPABASE_SERVICE_ROLE_KEY` is wrong for the project, or was rotated.
- `Email link is invalid or has expired` / `Token has expired or is invalid` from `verifyOtp`
  - Check that Auth is configured for **email OTP** and that `TEST_USER_EMAIL` exists in the project.

Noise in console during automation:
- `get_last_review_debug` missing:
  - This is an optional debug RPC; if the DB doesn't expose it publicly, the app will skip it silently.
- `Failed to load resource: 404`:
  - Often a missing local asset (favicon, etc.). Only investigate if it impacts the UI flow.

