# Intent

## Product Goal

2000nl supports Dutch vocabulary training with spaced repetition, dictionary-backed content, and user progress tracking. The repo is not just a web frontend; it combines product code, database logic, ingestion workflows, and deployment/runbook material needed to keep the system usable.

## What Matters Most

- Learning behavior must stay consistent across UI and DB-side FSRS logic.
- Auth and session flows must remain reliable across local dev, automation, and production.
- Imported dictionary content must stay compatible with the shared schema and training UI.
- Operational runbooks should make debugging production issues possible without reverse-engineering the repo.

## Current Active Areas

- Training UX and scheduling behavior in `apps/ui` plus `db/migrations`.
- Premium features and provider integrations documented in `docs/features/premium-features.md`.
- Production auth and test-account workflows documented in `docs/runbooks/production-login.md` and `apps/ui/README.md`.
- Audio/TTS behavior documented in `docs/runbooks/audio-tts-testing.md`, `docs/runbooks/audio-serving.md`, and `docs/runbooks/audio-download.md`.

## Canonical Navigation

- Root repo map: [AGENTS.md](../../AGENTS.md)
- System overview: [ARCHITECTURE.md](../../ARCHITECTURE.md)
- Data and contract docs: [packages/docs/README.md](../../packages/docs/README.md)
- Operational notes: [agents.md](../../agents.md)

## Documentation Conventions

- Stable system structure belongs in root docs.
- Product/runtime intent belongs in `docs/intent/`.
- Work-in-progress plans belong in `docs/exec-plans/active/`.
- Completed implementation records belong in `docs/exec-plans/completed/`.
- Known debt and structural cleanup items belong in `docs/tech-debt/`.
