# Connect credential boundary — issue #735

2026-10-17. Source: owner-authorized audit remediation and curator review.
Status: local implementation accepted; release held pending independent review and legacy retirement.

Connect issues opaque access and refresh credentials. Native Supabase credentials
remain encrypted under a dedicated server-only AES-256-GCM key in a service-only
row. Only the server constructs authenticated RPC clients using native JWTs. AES
authentication binds version, session id, user id, and connected-client id.
Consent requires a first-party principal. offline_access controls refresh issuance
and use. Code and refresh claims are atomic before external Auth effects; a failed
exchange after claim requires reconnection. Unknown opaque credentials fail closed.

Migration 229 adds storage only; no automatic Auth session deletion or rollout.
Legacy native credentials cannot be safely migrated from hashes. Release requires
explicit retirement of potentially delegated native Auth sessions and independently
refreshed descendants, then waiting maximum JWT lifetime or verified equivalent.
The current session table may omit historical users after cascading client deletion,
so cohort completeness must be proven or retirement broadened. Affected users log
in again; connected clients reconnect. Curator owns release.

ADR0001 public opaque contract remains, native-token MVP exception superseded.
Pontix and AudioFilms use opaque bearer and Connect refresh, requiring reconnect
only. Neighbor workspaces are read-only context. The encrypted native-pair bridge
was accepted by curator and conditionally by independent design review; refresh
has a 30-day absolute lifetime and failures after claim require reconnect. Local
implementation checks do not establish historical retirement. No public patch
until retirement coordination clears.
