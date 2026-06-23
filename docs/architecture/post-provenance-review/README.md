# Post-provenance architecture review

Date: 2026-06-23

This folder contains the follow-up architecture review after the source/provenance-aware learning-action work in `2000nl` and `audiofilms`.

Pontix / `translate-extension` is intentionally deferred and is not part of this current review package.

## Files

- `architecture-review-2026-06-23.md` — main review: blockers, code cleanliness, architecture risks, and recommended sequencing.
- `platform-engineering-principles.md` — 2000NL engineering principles for future agents.
- `delegated-follow-up-tasks.md` — work that should be delegated to implementation agents instead of done as opportunistic drive-by refactors.
- `publication-and-validation-status.md` — what was independently checked versus what is based on issue/agent reports.

## Current conclusion

The completed provenance slice is directionally sound: lookup remains read-only, mutations go through explicit Platform actions, source/action history is separated from current card state, and AudioFilms remains an external client rather than a learning-state authority.

The remaining risks are mostly maintainability and hardening issues:

- `apps/ui/lib/platform/platformApi.ts` is too broad and should be decomposed by domain.
- DB-side provenance functions have layered override migrations and need characterization tests before further simplification.
- AudioFilms YouTube extension code is too large for long-term safe evolution.
- CI should keep DB/RPC provenance tests and Platform route tests close to any future contract changes.

Pontix remains a separate future workstream.