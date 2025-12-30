# apps/api

Backend/API serving notes, lists, and user progress. Imports shared domain models and JSON Schemas from `packages/shared` and loads data from the DB populated by `packages/ingestion`.

Endpoints should cover:
- Notes lookup and search
- Lists (system NT2 2k, user-defined) and entries
- Training sessions by card type
- User progress mutations and history events
