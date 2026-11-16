# Connect session and subscription authority

Connect v2 returns opaque, random `nlc_a2_` access and `nlc_r2_` refresh credentials.
They work only at the application API; extensions must use `/api/connect/token`
for refresh and must not call Supabase Auth/Data APIs with these credentials.
The JSON token response retains `access_token`, `refresh_token`, `expires_at`,
`expires_in`, `token_type`, `scope` and the bounded user identity.

Provider access/refresh credentials stay server-side in an AES-256-GCM envelope,
bound by authenticated additional data to the connected session UUID. Set
`CONNECT_SESSION_ENCRYPTION_KEY` to 32 random bytes in standard base64 in the
server secret store. Do not expose it in browser variables or log envelopes,
backend proofs, tokens, or key material. Missing/invalid keys stop issuance and
refresh. Losing/changing the key requires reconnecting clients unless envelopes
are re-encrypted through a separately reviewed private operator procedure. There
is no online key-rotation procedure in this application change.

A stable Supabase `session_id`, not the current access-token hash, identifies
connected authority. A provider credential for a bound session also requires a
secret backend proof at the Data API. First-party consent rejects connected
credentials. Every application first-party request, including cache hits and
coalesced authentication, rechecks live DB session authority. Authorization code
and connected session revisions must match the current grant lifetime; revoking
or changing scopes invalidates earlier revisions even after another consent.
The consent upsert returns its exact revision in the same database statement.
Code insertion supplies that revision, and its trigger validates it under a grant
lock instead of adopting whatever revision is current at insertion time. The
final session insert/update serializes against grant/client changes.

Authorization codes and refresh credentials are claimed once before provider
side effects. Concurrent refresh has one winner. An uncertain provider/storage
failure consumes the credential and requires reconnecting; a lost successful
response does not justify retrying or restoring an old credential. An issuance
failure may leave a provider session with undisclosed credentials, or a committed
connection whose response was lost. No provider credentials are returned on
these paths. Refresh-token hash history (maximum 4096 rotations per 30-day family)
lets revocation with an earlier family token close a racing/newly rotated session.
Expired families require reconnecting. Revocation blocks subsequent requests;
already admitted application work can complete.

Migration 372 adds the PostgREST pre-request guard, restrictive table RLS and
Realtime-message guard. Authenticated sessions must exist in `auth.sessions`,
match the JWT user, remain unexpired and be created after the stored cutover.
A refreshed JWT preserves its original session ID and cannot evade that cutoff.
The DDL guard attaches restrictive policies when RLS tables have permissive
policies or client privileges. Service-only tables retain their absence of client
policies. New grants/ALTER TABLE invoke the guard. Schema review must retain
these fences when replacing policies or granting access through other schemas.

Migration 373 grants ordinary settings columns explicitly and denies client
INSERT/UPDATE of `subscription_tier`, DELETE and TRUNCATE. A trigger also rejects
indirect changes/deletes through definer functions. Trusted service writes and
account-deletion cascades remain supported. This does not retroactively establish
that existing paid/admin tier values are legitimate.

## Managed installation requirements

These are public fresh-install migrations, not instructions to apply them to an
existing managed database. No managed deployment, secret change or traffic switch
is authorized by this change. The private operations workspace must prepare a
forward migration and a release passport against the actual deployed revision.

The passport must coordinate the application, Auth, PostgREST and all clients:

- Audit existing `subscription_tier` values against trusted entitlement records;
  reconcile unexplained premium/admin values through the owner-approved process.
- Provision the server encryption key, validate supported `auth.sessions`
  columns/FK behavior and `session_id` claims on the actual GoTrue version.
- Stop old code issuance and invalidate existing authorization codes, tracked
  grants/sessions as appropriate, and legacy Auth sessions/refresh families.
  Choose and record a cutoff that forces reauthentication for all ambiguous
  legacy sessions. Existing tokens cannot be classified safely by token hash.
- The SQL cutoff protects application/Data API/RLS paths, not all Supabase Auth
  endpoints accepting still-valid legacy JWTs. Qualify signing-key rotation
  (including replacement anon/service keys and verifier reloads) or keep the
  guarded access window until the maximum old JWT lifetime expires. Inventory
  Storage, Realtime, other schemas and any independent JWT consumers; verify
  their invalidation before reopening access. Do not claim an unqualified
  zero-downtime path.
- Confirm client reconnect/refresh compatibility and admission onboarding, run
  both postflight-373 chains, and repeat real-provider security checks on staging.
- Assess the shortest already-qualified interruption path. Prepare images,
  secrets, backup/restore proof and compatibility checks before closing access
  where existing procedures permit. Record expected and actual interruption,
  backup, rollback and owner authorization. Rollback must not restore acceptance
  of the invalidated credentials or reopen tier mutation.

## Validation

From the repository root, with Docker and this checkout's UI dependencies:

```sh
node scripts/test-connect-security.mjs
```

The script creates and removes its own local-only Docker network, PostgreSQL 17,
GoTrue v2.197.0 and PostgREST v14.10 containers, uses dynamic loopback ports and
synthetic credentials, and runs the actual Next route handlers against those
services. It does not read deployment environment files. It runs 13 provider/API
scenarios plus four SQL role-boundary tests, including read-only denial, direct
Data API denial, concurrent refresh, revoke/regrant, revoke during issuance and
refresh, ambiguous persistence, pending admission and live cache invalidation.
The integration file is opt-in and skips without an explicit loopback target and
a disposable database accepted by the database test harness.

Additional checks, from `apps/ui`:

```sh
./node_modules/.bin/vitest run tests/api tests/serverSupabaseAuthCache.test.ts tests/connectSessionCredentials.test.ts
FSRS_TEST_DB_URL=<disposable-local-test-database> ./node_modules/.bin/vitest run tests/fsrs
npm run typecheck
npm run lint
```

The first-party authority check adds one Data API RPC round trip on every request,
including cache hits and concurrent callers. SQL pre-request/RLS checks run in the
same DB request; policy subqueries allow one evaluation per statement. Connected
requests perform session and live grant/client lookups, envelope decryption and
provider identity verification; they are deliberately not cached as first-party.
On the isolated local stack, 20 warm `/api/platform/session` requests measured
median 7.10 ms and p95 12.71 ms while the full database suite ran concurrently. This is an end-to-end local observation,
not a production baseline or an incremental-overhead estimate. Measure production
fanout/latency in staging before release; do not remove the live check to recover
cache latency.
