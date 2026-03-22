# apps/api

Reserved backend/API boundary for future extraction. This directory is not currently the primary runtime for 2000nl.

If this service is revived, it should import shared domain models and JSON Schemas from `packages/shared` and load data from the DB populated by `packages/ingestion`.

Potential responsibilities:
- Notes lookup and search
- Lists (system NT2 2k, user-defined) and entries
- Training sessions by card type
- User progress mutations and history events

Before adding code here, verify that the behavior does not already live in `apps/ui`, Supabase RPCs, or `db/migrations`.
