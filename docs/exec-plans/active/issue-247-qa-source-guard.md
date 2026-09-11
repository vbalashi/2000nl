# Issue #247: QA source guard

Status: implementation on `codex/247-qa-source-guard`.

The local QA wrapper must identify the code it starts. A health response that
only says `ok` is not enough when several old worktrees can start the same
application.

## Startup contract

The canonical command is allowed only from a clean `main` checkout after a
fresh `origin/main` fetch and exact SHA comparison:

```bash
scripts/ui-local-dev.sh --port 3100
```

An intentional preview must identify both its durable work reference and the
exact full commit already checked out:

```bash
scripts/ui-local-dev.sh \
  --port 3101 \
  --work-ref 247 \
  --expected-commit "$(git rev-parse HEAD)"
```

The verifier runs before Supabase discovery or Next startup. A missing pair,
detached/stale canonical checkout, or commit mismatch fails closed. A preview
may be dirty so an agent can inspect its current work; the response exposes
that fact explicitly.

## Evidence

The wrapper exports source metadata to the server. `/api/health` includes
`qaSource` with:

- mode and work reference;
- absolute checkout path and full commit SHA;
- branch/detached state and dirty flag;
- upstream and ahead/behind counts;
- current `origin/main`, remote refs containing the head, and a
  squash-merged indication.

The application commit shown by health is the verified checkout SHA, not a
generic `dev` marker.

## Worktree inventory

Refresh the non-destructive inventory with:

```bash
node scripts/inventory-qa-worktrees.mjs \
  --output docs/architecture/target-state-2026-09/worktrees.json
```

The inventory records dirty, detached, unpushed, integrated, and
patch-equivalent/squash-merged signals. It marks known owner-preserved visual
worktrees. It is evidence for review, never permission to delete: age, clean
status, ignored-file presence, or patch equivalence alone must not retire a
worktree. The protected draft #144 remains out of scope, as do the owner-
preserved visual worktrees #137 and #194.

Direct `npm run dev` remains available for ordinary development, but it is not
a QA-evidence path because it does not establish the source contract. Use the
wrapper for browser smoke and attach the health response to the work reference.
