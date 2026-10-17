# Connected Client Session Token Shape

The public contract treats Connected Client credentials as opaque 2000NL bearer
tokens. Issue #735 implements that boundary: clients receive random opaque access
and refresh tokens, never native Supabase user credentials. Hashes bind them to a
revocable service-only session row. Native credentials are authenticated encrypted
with a dedicated server-only key and used only to construct internal user-context
RPC clients, preserving existing SQL authorization without granting clients Data
API access. Opaque requests always validate client, grant, scope and expiry.

Consent requires a first-party principal. Refresh requires offline_access and
rotates both opaque credentials after an atomic claim. Code/refresh failures after
claim require reconnect, with no automatic replay. Refresh has a 30-day absolute
lifetime. Native-only endpoints reject opaque credentials.

This supersedes the MVP's native-token implementation exception. Deployment is
held until historical native sessions and their refresh descendants are retired
and their outstanding JWT expiry horizon has passed. Existing hashes cannot prove
complete historical attribution. No automatic Auth deletion is part of migration
229. See [decision](../discussions/2026-10-17-10-connect-credential-boundary.md)
and [rollout](../runbooks/connect-credential-rollout.md).
