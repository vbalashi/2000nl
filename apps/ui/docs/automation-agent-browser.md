# Browser Automation (agent-browser)

This doc is for running quick UI smoke checks with `agent-browser` in both desktop and mobile viewports, without getting stuck on Supabase OTP auth.

Recommended approach: use a persistent `agent-browser --profile ...` directory and inject a freshly-minted Supabase session JSON into `localStorage` once. After that, the profile keeps you logged in across runs.

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
- It then exchanges the OTP for a real Supabase session and stores the session JSON in `localStorage` (Supabase format).

If this flow is flaky in headless automation (token rotation / Strict Mode timing), use the deterministic injection flow below.

## Persistent Profile (Recommended)

Use a single profile directory for local automation:

- `tmp/agent-browser/profile-2000nl-local`

Notes:
- `--profile` only applies when the agent-browser daemon starts. If you see `--profile ignored: daemon already running`, run `agent-browser close` and retry.
- Never commit anything under `tmp/`.

## Deterministic Session Injection (Recommended)

1) Mint a session JSON (server-side, no email) and write it to `tmp/agent-browser/`:

```bash
cd /home/khrustal/dev/2000nl-ui
mkdir -p tmp/agent-browser
set -a && source .env.local && set +a
node - <<'NODE'
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.TEST_USER_EMAIL;

const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const pub = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

(async () => {
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error) throw link.error;
  const otp = link.data.properties.email_otp;
  const ver = await pub.auth.verifyOtp({ email, token: otp, type: 'email' });
  if (ver.error) throw ver.error;

  const payload = { session: ver.data.session };
  const outJson = path.join('tmp', 'agent-browser', 'local-session.json');
  const outB64 = path.join('tmp', 'agent-browser', 'local-session.b64');
  fs.writeFileSync(outJson, JSON.stringify(payload, null, 2));
  fs.writeFileSync(outB64, Buffer.from(JSON.stringify(payload), 'utf8').toString('base64'));
  console.log('Wrote', outJson);
})();
NODE
```

2) Inject into `http://127.0.0.1:3000` using a persistent profile:

```bash
cd /home/khrustal/dev/2000nl-ui
b64=$(cat tmp/agent-browser/local-session.b64)

agent-browser close || true
agent-browser --session ab-local --profile tmp/agent-browser/profile-2000nl-local open http://127.0.0.1:3000/
agent-browser --session ab-local wait --load networkidle

cat <<EOF | agent-browser --session ab-local eval --stdin
(() => {
  const key = "sb-lliwdcpuuzjmxyzrjtoz-auth-token";
  const json = atob("${b64}");
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith("sb-")) localStorage.removeItem(k);
  }
  localStorage.setItem(key, JSON.stringify(JSON.parse(json).session));
  return "ok";
})()
EOF

agent-browser --session ab-local reload
agent-browser --session ab-local wait --text "Antwoord Tonen"
```

3) Next runs (no auth step):

```bash
agent-browser --session ab-local --profile tmp/agent-browser/profile-2000nl-local open http://127.0.0.1:3000/
```

## Desktop Run (Example)

```bash
outdir="tmp/agent-browser-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$outdir"

agent-browser --session ab-desktop set viewport 1440 900
agent-browser --session ab-desktop --profile tmp/agent-browser/profile-2000nl-local open "http://127.0.0.1:3000/"
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
agent-browser --session ab-mobile --profile tmp/agent-browser/profile-2000nl-local open "http://127.0.0.1:3000/"
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
   agent-browser --state tmp/ab-auth.json open http://127.0.0.1:3000/
   ```

2. Use a persistent profile directory:
   ```bash
   agent-browser --profile tmp/agent-browser/profile-2000nl-local open http://127.0.0.1:3000/dev/test-login?redirectTo=/
   # Next time, reuse the same profile:
   agent-browser --profile tmp/agent-browser/profile-2000nl-local open http://127.0.0.1:3000/
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
