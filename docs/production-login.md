# Production Login (Testing/Troubleshooting)

Production UI: https://2000.dilum.io

This app uses Supabase Auth. In production, the `/dev/test-login` helper is intentionally disabled.

This doc describes two ways to get an authenticated session in production for debugging (e.g. testing sentence audio playback) without waiting for OTP email delivery.

## Option A: Normal Production Login (OTP/OAuth)

1. Open `https://2000.dilum.io`.
2. Log in via email OTP or Google OAuth.

This is the simplest and safest path.

## Option B: Inject a Supabase Session Token into Production

Supabase sessions are stored in `localStorage` under a key like:

- `sb-<project_ref>-auth-token`

For this project, `<project_ref>` is `lliwdcpuuzjmxyzrjtoz`, so the key is:

- `sb-lliwdcpuuzjmxyzrjtoz-auth-token`

Because `localStorage` is origin-scoped, a session minted on `http://127.0.0.1:3001` does not automatically apply to `https://2000.dilum.io`. To use a local/dev-minted session in prod, you must copy the session JSON into prod's `localStorage`.

### 1) Mint a session JSON (server-side, no email)

This uses the Supabase service role key to generate an OTP and exchange it for a real session.

Prereqs (already supported by `.env.local` in this repo):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TEST_USER_EMAIL`

Command:

```bash
cd /home/khrustal/dev/2000nl-ui
set -a && source .env.local && set +a
node - <<'NODE'
const fs = require('fs');
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

  // Write session JSON to a file (do not commit it)
  fs.writeFileSync('tmp/prod-session.json', JSON.stringify({ session: ver.data.session }, null, 2));

  // Sanity check: refresh token should be usable
  const rt = ver.data.session.refresh_token;
  const resp = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: anon, authorization: `Bearer ${anon}`, 'content-type': 'application/json' },
    body: JSON.stringify({ refresh_token: rt }),
  });
  if (!resp.ok) {
    throw new Error(`refresh failed: ${resp.status} ${await resp.text()}`);
  }

  console.log('Wrote tmp/prod-session.json');
})();
NODE
```

### 2) Inject into production with `agent-browser`

This is the most repeatable flow for debugging.

```bash
cd /home/khrustal/dev/2000nl-ui

# Use a persistent profile so the prod session sticks across runs.
# If you see `--profile ignored: daemon already running`, run `agent-browser close` and retry.
mkdir -p tmp/agent-browser
agent-browser close || true

# Convert the session JSON to base64 to avoid quoting issues when passing to agent-browser.
node - <<'NODE'
const fs = require('fs');
const payload = fs.readFileSync('tmp/prod-session.json', 'utf8');
fs.writeFileSync('tmp/prod-session.b64', Buffer.from(payload, 'utf8').toString('base64'));
NODE

b64=$(cat tmp/prod-session.b64)

agent-browser --session prod2000 --profile tmp/agent-browser/profile-2000nl-prod open https://2000.dilum.io/
agent-browser --session prod2000 wait --load networkidle

# Clear existing Supabase keys + set the new session JSON
cat <<EOF | agent-browser --session prod2000 eval --stdin
(() => {
  const key = "sb-lliwdcpuuzjmxyzrjtoz-auth-token";
  const json = atob("${b64}");
  const session = JSON.parse(json).session;
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith("sb-")) localStorage.removeItem(k);
  }
  localStorage.setItem(key, JSON.stringify(session));
  return "ok";
})()
EOF

agent-browser --session prod2000 reload
agent-browser --session prod2000 wait --load networkidle
agent-browser --session prod2000 snapshot -i -C
```

You should now see the training UI (not the auth screen).

### 3) Next runs (no auth step, usually)

```bash
agent-browser --session prod2000 --profile tmp/agent-browser/profile-2000nl-prod open https://2000.dilum.io/
agent-browser --session prod2000 wait --text "Antwoord Tonen"
```

If it drops back to the login screen, the session likely expired. Re-run steps (1) + (2) to mint and inject a new session.

### Security notes

- `SUPABASE_SERVICE_ROLE_KEY` must never be exposed client-side or shipped to production.
- `tmp/prod-session.json` contains a live session token. Do not commit it.
- Prefer Option A (real login) whenever possible.
