# 2000nl Monorepo

This repository hosts the full stack for the 2000nl project. Scheduling for training now uses an FSRS-6 implementation that lives in Postgres (see `db/migrations/0010+`), with a 4-grade UI (again/hard/good/easy) and defaults of 10 new cards/day and unlimited reviews.

Deployed locally on `nuc` via Docker Compose. Caddy is a separate stack in `/srv/caddy` and proxies this app at `http://2000.nuc`.

Production UI: `https://2000.dilum.io`

- Local UI builds/linting require Node 20+ (some dependencies declare `node >= 20`). The Docker build uses `node:22-bookworm-slim`.

## Deployment notifications (Telegram)

The `deploy-nuc` GitHub Actions workflow can send Telegram notifications on deploy start/success/failure.

Setup:
- Create a bot with BotFather and copy the bot token.
- Add GitHub Actions secrets:
  - `TELEGRAM_BOT_TOKEN` (bot token)
  - `TELEGRAM_CHAT_ID` (chat/channel ID that receives notifications)
- (Optional) Update `.github/workflows/deploy-nuc.yml` if the server name changes.

- `apps/ui/` – Next.js web client (moved from the original @2000nl-ui project).
- `apps/api/` – API service placeholder.
- `packages/ingestion/` – data validation and loaders (from @2000nl-db importer).
- `packages/scraper/` – scraping adapters (vandale parser included).
- `packages/shared/` – shared schemas, types, card-type registry.
- `packages/docs/` – architecture and contract docs.
- `db/` – SQL migrations and seeds consumed by ingestion/API.
- `ops/` – ops/CI/IaC placeholders.

See `packages/docs/README.md` for documentation pointers.

Helper docs:
- `packages/ingestion/SCRIPTS.md` – ingestion script purposes and timestamps.
- `agents.md` – how to connect with `psql` to Supabase for validating data.
- `docs/production-login.md` – how to log into production for debugging (OTP/OAuth or token injection).
- `docs/audio-tts-testing.md` – how to test and troubleshoot sentence audio (TTS) playback.
- `reports/telegram-notifications-setup.md` – step-by-step Telegram deploy notification setup.
