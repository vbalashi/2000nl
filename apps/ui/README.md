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

## Testing

- Component tests (React Testing Library + Vitest):
  ```
  npm test
  ```
- End-to-end (`@playwright/test`):
  ```
  npm run test:e2e
  ```
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
4. Set **OTP length** to `6` digits
5. Save changes and test sign-in from the app

Notes:
- The UI enforces a 6-digit numeric OTP and will reject non-numeric input.
- OTP delivery time and expiration are controlled by Supabase; verify codes arrive within 30 seconds and expire appropriately.

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
