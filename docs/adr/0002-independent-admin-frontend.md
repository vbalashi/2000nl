# ADR-0002: Independent Admin frontend

Accepted 2026-11-16 by the owner. Public work: #156.

Admin has its own repository and build, separate from the learning application and Editor. The first extraction moves the reports screen. The 2000NL backend retains administrative sessions, report APIs, role/capability enforcement, database access and mandatory audit. Admin has no direct database credentials.

Initially mount the independent artifact at `/admin/reports/` on the backend origin. Existing `/admin` login and `/api/admin/*` remain served by the backend. This preserves host-only HttpOnly cookies and avoids cross-origin token transfer. Ingress must route both the page and its asset prefix explicitly. Remaining legacy administrative screens are a later extraction.

The backend requires `feedback.read` for list/detail. `editorial.edit` is reserved for a future protected write boundary; it does not implement editing. One account can hold administrative and editorial capabilities. Grants are explicit and audited, never inferred from frontend routes.

Backend DB372 and report APIs must be installed before enabling the Admin route. Static artifact and routing rollback must not restore old database snapshots. A new hostname requires its own reviewed authentication contract.
