# TODO: Supabase Database Optimization

**Created:** 2026-01-25
**Related Report:** [supabase-audit-2026-01-25.md](../../reports/supabase-audit-2026-01-25.md)
**Status:** Mixed: substantial parts completed, some follow-up work still open.

## Read This As

This file is now the index for the Supabase optimization effort. Open only the section relevant to the work you are doing.

## Sections

- [Overview and status](./supabase-optimization/overview.md)
- [RLS performance plan](./supabase-optimization/rls-performance.md)
- [Security definer audit](./supabase-optimization/security-definer.md)
- [Migration discipline](./supabase-optimization/migration-discipline.md)
- [API contract follow-up](./supabase-optimization/api-contract.md)

## Current Assessment

- Completed: missing policy capture, main RLS optimization migrations, migration-discipline guardrails, and the first security audit pass.
- Still open: benchmark verification, production rollout confirmation, private schema cleanup, and a final public API reference pass.

## Related Docs

- [docs/reference/api-functions.md](../reference/api-functions.md)
- [db/README.md](../../db/README.md)
- [reports/security-definer-audit.md](../../reports/security-definer-audit.md)
