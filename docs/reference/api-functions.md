# Public API Functions

**Last Updated:** 2026-03-22
**API Base:** `https://<project-ref>.supabase.co/rest/v1/rpc/`

This file is now the index for the public Supabase RPC surface. Open only the function group you need.

## Shared Rules

- All public-schema functions are exposed through PostgREST as `POST /rest/v1/rpc/<function_name>`.
- Most user-bound functions require authenticated calls and validate that `p_user_id` matches `auth.uid()`.
- Internal helpers that should not be reachable via PostgREST belong in `private` schema.

## RPC Groups

- [Training and queue functions](./api-functions/training-and-queue.md)
- [Review functions](./api-functions/review.md)
- [Statistics functions](./api-functions/statistics.md)
- [User, search, and list functions](./api-functions/search-and-user.md)
- [Security notes, testing, and migration history](./api-functions/security-and-testing.md)

## Related Docs

- [docs/tech-debt/TODO-supabase-optimization.md](../tech-debt/TODO-supabase-optimization.md)
- [db/README.md](../../db/README.md)
- [reports/security-definer-audit.md](../../reports/security-definer-audit.md)
