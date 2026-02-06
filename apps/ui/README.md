# 2000NL Training UI

Next.js + Tailwind frontend for the NT2 training experience, wired to Supabase for data, auth, and event tracking. Training now uses the FSRS-6 scheduler exposed via Supabase RPCs with a 4-grade flow (Again/Hard/Good/Easy), defaulting to 10 new cards per day and unlimited reviews.

## Setup

Requires Node 20+.

1. Copy Supabase credentials into `.env.local` (or set environment variables):
   ```
   NEXT_PUBLIC_SUPABASE_URL=your-project-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   ```
2. Install dependencies:
   ```
   npm install
   ```
3. Run the dev server:
   ```
   npm run dev
   ```

## Translation providers

Translations are provided by a selectable backend. Configure these env vars in `.env.local` or deployment settings:

```
TRANSLATION_PROVIDER=deepl
TRANSLATION_FALLBACK=deepl
DEEPL_API_KEY=your-deepl-key
OPENAI_API_KEY=your-openai-key
OPENAI_MODEL=gpt-4o-mini
GEMINI_API_KEY=your-gemini-key
GEMINI_MODEL=gemini-1.5-flash
```

Notes:
- Supported providers: `deepl`, `openai`, `gemini` (when implemented).
- Set `TRANSLATION_PROVIDER=openai` to route translations through OpenAI; `TRANSLATION_FALLBACK=deepl` enables automatic fallback if OpenAI fails.
- Set `TRANSLATION_PROVIDER=gemini` to route translations through Gemini; `TRANSLATION_FALLBACK=deepl` enables automatic fallback if Gemini fails.
- `OPENAI_MODEL` is optional; defaults to `gpt-4o-mini`.
- `OPENAI_API_URL` is optional; defaults to `https://api.openai.com/v1/chat/completions`.
- `GEMINI_MODEL` is optional; defaults to `gemini-1.5-flash`.
- `GEMINI_API_URL` is optional; defaults to `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`.

## Testing

- Component tests (React Testing Library + Vitest):
  ```
  npm test
  ```
- End-to-end (`@playwright/test`):
  ```
  npm run test:e2e
  ```

### Test Account (Automation)

For browser automation (Playwright, `agent-browser`, CI smoke checks) it helps to have a dedicated test user.

1. Put credentials in `.env.local` (gitignored) or your CI secrets:
   - `TEST_USER_EMAIL`
   - `TEST_USER_PASSWORD`
2. (Optional, recommended) Provision the user + seed predictable data via Supabase Admin API:
   ```
   NEXT_PUBLIC_SUPABASE_URL=... \
   SUPABASE_SERVICE_ROLE_KEY=... \
   TEST_USER_EMAIL=test@2000nl.test \
   TEST_USER_PASSWORD=test-password-123 \
   node scripts/test-account.js create+seed
   ```

Notes:
- The UI login flow is OTP-only, but automated tests can bypass the UI by installing a Supabase session in `localStorage`.
- For local development / browser automation that needs a *real* Supabase session without typing an OTP, use the dev-only helper page:
  - `http://localhost:3000/dev/test-login` (requires `SUPABASE_SERVICE_ROLE_KEY` and `TEST_USER_EMAIL` on the server)
- For `agent-browser` examples (desktop + mobile) and how to persist sessions across runs, see `apps/ui/docs/automation-agent-browser.md`.
- `SUPABASE_SERVICE_ROLE_KEY` must never be exposed client-side.

- FSRS parity + RPC tests (need a Postgres URL; runs DB migrations, so point at a disposable/non-prod DB):
  ```
  # preferred: Supabase psql URL in env, e.g. in db/.env.local or apps/ui/.env.local
  # SUPABASE_DB_URL=postgresql://USER:PASSWORD@HOST:PORT/postgres?sslmode=require
  FSRS_TEST_DB_URL="$SUPABASE_DB_URL" npm test -- tests/fsrs/*.test.ts
  ```
  - If `FSRS_TEST_DB_URL` is absent, tests are skipped locally. CI provides Postgres.
  - Uses migrations in `db/migrations`, so avoid pointing at production.

## Supabase integration

- Tables used:
  - `word_lists` / `word_list_items` (NT2 list)
  - `word_entries` (headwords, raw definitions)
  - `user_word_status` (per-user review state with FSRS fields)
  - `user_review_log` (FSRS audit trail)
  - `user_events` (review and click events)
- Auth flows via Supabase Auth; provide `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` at runtime.

### Supabase Auth URL configuration (production)

Configure these in the Supabase dashboard to ensure auth emails point to production and callbacks succeed:

1. Supabase Dashboard → Authentication → URL Configuration
2. Set **Site URL** to `https://2000.dilum.io`
3. Add **Redirect URLs** (one per line):
   - `https://2000.dilum.io/auth/callback`
   - `https://2000.dilum.io`
   - `http://localhost:3000/auth/callback` (dev)
   - `http://localhost:3000` (dev)
4. Verify the domain is reachable over HTTPS (valid certificate and redirects configured)

Notes:
- Supabase uses **Site URL** to construct email links (magic link/OTP). If it stays on localhost, production users will receive broken links.
- Keep localhost entries for local testing; production email links will still use the Site URL.

### Supabase Auth OTP configuration (passwordless)

Configure OTP sign-in and disable password auth to match the UI:

1. Supabase Dashboard → Authentication → Providers → Email
2. Disable **Password** (turn off password-based auth)
3. Enable **Email OTP** (one-time passcode)
4. Set **OTP length** to `6` or `8` digits (match the UI)
5. Save changes and test sign-in from the app

Notes:
- The UI accepts numeric OTPs up to the configured length; set `NEXT_PUBLIC_SUPABASE_OTP_LENGTH` to match the Supabase setting (6 or 8).
- If `NEXT_PUBLIC_SUPABASE_OTP_LENGTH` is unset, the UI defaults to 8 digits to avoid truncating 8-digit codes.
- OTP delivery time and expiration are controlled by Supabase; verify codes arrive within 30 seconds and expire appropriately.
- OTP emails use the magic link template, so keep that template in sync with OTP copy and branding.

### Supabase Auth email template branding

Customize Supabase email templates with 2000nl branding (logo wordmark, primary color, and professional Dutch copy):

1. Export a personal access token from Supabase: https://supabase.com/dashboard/account/tokens
2. Run the template update script:
   ```
   SUPABASE_ACCESS_TOKEN=your-token \
     /home/khrustal/dev/2000nl-ui/scripts/update-supabase-email-templates.sh
   ```
3. Supabase Dashboard → Authentication → Email Templates
4. Verify confirmation (registration), recovery (password reset), and magic link (OTP) templates render correctly.
5. Send test emails to Gmail, Outlook, and iOS Mail and confirm branding/CTA buttons render well.

### Supabase Google OAuth configuration

Enable Google as the primary auth provider for browser + PWA:

1. Google Cloud Console → APIs & Services → Credentials
2. Create OAuth client (Web application) and add the **Authorized redirect URI**:
   - `https://<your-project-ref>.supabase.co/auth/v1/callback`
3. Supabase Dashboard → Authentication → Providers → Google
4. Enable Google and paste the Client ID + Secret
5. Supabase Dashboard → Authentication → URL Configuration
   - Ensure `https://2000.dilum.io/auth/callback` and `https://2000.dilum.io` are included in Redirect URLs
   - Keep localhost entries for dev

Notes:
- The UI uses the PKCE auth flow for OAuth to improve session persistence on iOS PWA.
- `NEXT_PUBLIC_SITE_URL` should match the current origin so OAuth redirects to `/auth/callback` on the same domain.

## Scripts

- `apps/ui/scripts/import_words.py` (last modified 2025-12-02) — legacy helper to import dictionary JSON into Postgres; prefer `packages/ingestion/scripts/import_words_db.py` for current ingestion.

## Hotkeys / grading

- Space: show/hide
- H: Again
- J: Hard
- K: Good
- L: Easy
- F: Freeze (until tomorrow)
- X: Hide
- ?: Hotkey help
