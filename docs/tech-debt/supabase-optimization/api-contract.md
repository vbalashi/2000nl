# Supabase Optimization: API Contract

## Goal

Make the intended public RPC surface explicit so security and performance work does not drift away from frontend reality.

## Public RPC Surface

The current canonical reference lives in [docs/reference/api-functions.md](../../reference/api-functions.md).

## Why This Was Part Of Optimization

- SECURITY DEFINER audits require a clear distinction between public and internal functions.
- RLS and auth checks only make sense when the public call surface is explicit.
- Debug helpers should not remain accidentally reachable via PostgREST.

## Remaining Checks

- Confirm every frontend-used RPC is documented
- Confirm internal helpers are either private-schema or trigger-only
- Keep auth expectations aligned with the live SQL definitions
