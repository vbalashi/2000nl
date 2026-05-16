# Supabase Optimization: Overview

## Status Summary

### Must Do
- P1.3 Benchmark performance before/after
- P1.4 Confirm production matches the current consolidated migrations in `db/migrations/001_core_schema.sql` through `007_review_idempotency.sql`

### High Value
- P2.2 Create private schema for internal functions
- P2.3 Keep public API documentation aligned with live RPC surface

### Completed
- P0 Missing policy capture
- P1 Main RLS optimizations
- P2.1 Initial security audit
- P3 Migration-discipline improvements

## Success Metrics

### Performance
- Training queue query: target under 5ms
- Dashboard load: target under 50ms
- P95 API response time: target under 100ms

### Security
- All SECURITY DEFINER functions audited
- Non-API functions moved to private schema
- Public API surface documented

### Process
- Zero migration drift in version control
- Pre-commit reminders installed
- CI drift checks in place

## Timeline

- Week 1: capture missing policies, optimize RLS, deploy
- Week 2: complete security audit and process improvements
- Week 3+: follow-up optimizations as needed

## Questions / Blockers

- When was the last manual DB change made?
- Who still has direct DB access?
- Is staging in sync with production?
- Has production received the optimized migrations?

## Implementation Log

### 2026-01-25 - P0 and P1 Completed

Historical pre-consolidation migrations:
1. `008_capture_missing_policies.sql`
2. `009_optimize_rls_performance.sql`
3. `010_enable_rls_review_settings.sql`

Current fresh-deploy state is captured in the consolidated files under `db/migrations/`.

Verified:
- InitPlan caching pattern applied to `auth.uid()` usage
- RLS enabled on user tables
- Drift addressed in migrations

### 2026-01-25 - P3 Completed

Delivered:
1. `.githooks/pre-commit`
2. Migration workflow guidance in `db/README.md`
3. `.github/workflows/db-drift-check.yml`

### 2026-01-25 - P2.1 Security Audit Complete

Results:
- 12 SECURITY DEFINER functions reviewed
- 9 functions missing auth checks before fixes
- Auth checks were later folded into the consolidated migration files

Reference report: [reports/security-definer-audit.md](../../../reports/security-definer-audit.md)
