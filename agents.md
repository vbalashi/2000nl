# Agent Notes

## Running psql against Supabase

1. Obtain your Supabase connection string from the project settings (Database > Connection string > psql).
2. Export it as an environment variable (or paste directly when prompted):
   ```
   export SUPABASE_DB_URL="postgresql://USER:PASSWORD@HOST:PORT/postgres?sslmode=require"
   ```
3. Connect with `psql`:
   ```
   psql "$SUPABASE_DB_URL"
   ```
4. Quick validation queries:
   - Count entries: `select count(*) from word_entries;`
   - Inspect a headword: `select headword, part_of_speech, is_nt2_2000 from word_entries limit 5;`
   - Lists: `select name, count(*) from word_list_items join word_lists using (id) group by name;`
   - Progress: `select count(*) from user_events;`

Tip: if using a local `.env.local`, you can store `SUPABASE_DB_URL` there and run `psql "$(grep SUPABASE_DB_URL .env.local | cut -d= -f2-)"`.

## UI build/lint notes
- Local UI lint/build expects Node 20+ (some dependencies declare `node >= 20`).
- From repo root, build the UI container with `docker compose build ui`.
- For local lint/build, use `cd apps/ui && npm install && npm run lint`.

## FSRS reference
- FSRS-6 is implemented in Postgres functions (`db/migrations/0010+`), with RPCs `handle_review`, `handle_click`, and `get_next_word`.
- Defaults: 10 new cards/day, unlimited reviews; 4 grades (again/hard/good/easy) plus freeze/hide.
- Clicks are treated as lapses (grade=again).

## Premium Features (Translations & Audio)
- LLM translation pipeline (OpenAI GPT-5.2), premium TTS (Google/Azure), env vars, cache invalidation, troubleshooting: `docs/premium-features.md`

## Production Debugging
- Prod login techniques (including token/session injection for `agent-browser`): `docs/production-login.md`
- Sentence audio (TTS) testing and troubleshooting: `docs/audio-tts-testing.md`

## agent-browser Auth Persistence (Local Dev + Prod)

Use a persistent browser profile so you don't have to fight OTP/login during automation:

- Local dev profile dir: `tmp/agent-browser/profile-2000nl-local` (do not commit)
- Prod profile dir: `tmp/agent-browser/profile-2000nl-prod` (do not commit)
- Session names (suggested): `ab-local`, `ab-prod`

Important:
- `--profile` is only applied when the agent-browser daemon starts. If you reuse a running daemon you can get `--profile ignored: daemon already running`. Fix: `agent-browser close` then re-run the command with `--profile`.
- Supabase auth is stored in `localStorage` under `sb-lliwdcpuuzjmxyzrjtoz-auth-token` (origin-scoped), so you must inject separately for `http://127.0.0.1:3000` (dev) and `https://2000.dilum.io` (prod).

Deterministic flow (recommended):

1) Mint a Supabase session JSON (server-side) and write base64 to `tmp/agent-browser/*.b64`:
   - Local dev: `apps/ui/docs/automation-agent-browser.md` (Deterministic Session Injection)
   - Production: `docs/production-login.md` (Inject a Supabase Session Token into Production)
2) Inject into the correct origin once (dev or prod) using a persistent `--profile`, then reload.
3) Subsequent runs reuse the same `--profile` and typically don't need reinjection until the session expires.
