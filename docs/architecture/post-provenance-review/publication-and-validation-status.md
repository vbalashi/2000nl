# Publication and validation status

Date: 2026-06-23

This file records what was checked directly versus what is based on issue closure reports.

## Published materials

This folder was created in GitHub because the sandbox attachments from the chat were not downloadable for the user.

Files:

- `README.md`
- `architecture-review-2026-06-23.md`
- `platform-engineering-principles.md`
- `delegated-follow-up-tasks.md`
- `publication-and-validation-status.md`

AudioFilms-specific principles are published separately in the `audiofilms` repository under `docs/architecture/external-learning-client-principles.md`.

## Direct GitHub review performed

Reviewed current repository files and issue closure state for:

- `2000nl` issue #3 — connected client identity and scope enforcement;
- `2000nl` issue #4 — source-context v2, artifact identity, semantic idempotency, private source handling;
- `2000nl` issue #5 — learning activity/card read APIs;
- `2000nl` issue #6 — roadmap closure;
- `audiofilms` issue #1 — frozen YouTube dictionary provenance;
- relevant 2000NL Platform files, DB migrations, and docs;
- relevant AudioFilms extension source files and docs.

## Evidence from closed issues

The implementation agents reported these checks in issue comments:

- 2000NL focused Platform and Connect route tests passed.
- 2000NL `npm run test:platform` passed.
- 2000NL typecheck and lint passed.
- 2000NL local Supabase reset / FSRS DB tests passed.
- AudioFilms changed JS syntax checks passed.
- AudioFilms `npm run lint` passed.
- AudioFilms `npm run build` passed.

These are closure-report facts, not independently rerun by this documentation upload.

## Independent validation status for this upload

No runtime code was changed in this upload. The changes are documentation-only.

I did not rerun local `npm`, DB, or browser tests as part of writing these docs. The review is based on GitHub code inspection and the closed-issue evidence above.

## Important correction

Earlier chat material listed sandbox download links for several files. Those files were not reliably present/downloadable. This GitHub documentation folder is the durable replacement source.

## What remains deferred

Pontix remains deferred. Do not infer from these materials that Pontix web/text/ebook provenance is complete.

The remaining recommended work is follow-up cleanup:

- decompose 2000NL Platform application services;
- add current-state reference docs for active provenance RPC behavior;
- harden read-model privacy tests;
- modularize the AudioFilms YouTube extension gradually.