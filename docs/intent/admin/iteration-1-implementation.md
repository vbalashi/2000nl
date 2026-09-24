# 2000NL admin console — iteration 1 implementation notes

Issue: [#480](https://github.com/vbalashi/2000nl/issues/480)
Status: first implementation is in review. Authentication and audit decisions
were confirmed in #480; real credentials, account provisioning, production
configuration, and rollout remain outside this implementation pass.

## Scope

The first slice is limited to operator sign-in/session, dictionary registry and
metadata, and the administrative journal. It does not change learner access,
dictionary publication, training filters/queues, FSRS, or scheduler state. No
production account, database migration, deployment, or live-infrastructure
change is included before the corresponding owner decision and review.

The visual reference is Pencil 2000NL Admin revision v0.3. It remains labelled
REVIEW; this implementation does not change the canvas or its approval status.
Local fixtures are reachable only from the development-only
`/admin/preview` route when `ADMIN_UI_PREVIEW=true`; this route is disabled in
production and is not an authentication substitute.

## Operator authentication contract

The learner app currently uses passwordless Supabase Auth OTP and persists its
session in browser localStorage. The `auth.users` insert trigger in
`db/migrations/004_user_features.sql` creates a `user_settings` row with the
learner `free` default. Reusing the same Auth project would therefore create a
learner-side record for each operator identity, and browser-managed learner
auth would need extra work to guarantee session isolation.

Owner decision: use the existing Supabase project and its Google provider; MFA
is not required. An existing learner Google identity may also be explicitly
added to the manually maintained operator allowlist (owner clarification, 2026-09-24).
A learner profile neither grants nor blocks administrative access. The
auth-user insert trigger skips learner settings creation for new active
allowlisted operator email addresses. Existing learner profiles are retained.

The admin console uses a separate server-managed HttpOnly cookie. Every
protected server request verifies the Supabase identity, its active operator
row, the server-side admin session, its expiry/revocation state, and the
specific `dictionaries.read` or `audit.read` capability. It never relies on
learner `user_settings`, subscription tier, provider user metadata, or
frontend state for authorization. Normal sign-out in either surface revokes
only that surface’s Supabase session; the learner logout no longer requests global sign-out. Existing
learner profiles, subscriptions and progress are never modified by admin login.
The absolute admin session lifetime is eight hours; deactivation and session
revocation deny the next request. Google
sign-up is initiated only by a server-checked allowlisted email. Learner OTP
flows and settings are unchanged.

Bootstrap an operator by inserting their normalized email into
`public.admin_operators` with `is_active = true` and the minimum required
permissions, then have them authenticate with that Google identity once. The
callback binds its Auth user ID. No real operator is provisioned by this issue.
Recovery is owner-assisted: deactivate the row to revoke future access, revoke
active database sessions, correct the allowlisted email/permissions, then ask
the operator to authenticate again. If the identity itself must be replaced,
prepare the replacement Google identity and repeat the bootstrap. There is no
MFA reset path because MFA is not part of this policy.

The journal records application-observed successful/denied sign-in, sign-out,
access-denied, registry/detail reads, and journal reads. It does not claim to
contain complete Google or Supabase authentication history.

## Dictionary read projection

The registry uses `dictionaries` and the optional `dictionary_schemas` relation.
Its DTO includes the stable ID/key, name, language, existing `kind`, existing
visibility, safe owner ID when present, source provider/version, schema key and
version, and stored creation/update timestamps. It does not select
`word_entries`, raw dictionary payloads, entitlement rows, or learner state.
The current schema has no bounded count projection, so counts display “Нет
данных”; no exact count scan is performed.

The only dictionary kinds are `curated` and `user`. Visibility is shown as its
stored value (`system`, `private`, `shared`, or `public`); an unknown or missing
value displays “Нет данных.” No future publication state is inferred. The
legacy `can_access_dictionary` helper treats `system`, `public`, and `shared`
as eligible for read subject to tier checks, while other lookup contracts also
include entitlement checks. The admin view reports the stored visibility and
does not reinterpret `shared` as public-by-link.

Registry ordering is name ascending with ID as a stable tie-breaker. Search,
language, kind, page, and page size are URL-backed. Page sizes are 25, 50, or
100; reads request one extra row to determine `hasNext`, without an exact total.
Metadata and registry DTOs preserve absent values rather than filling them with
synthetic values.

## Administrative journal and client context

The proposed application-boundary event set is successful sign-in, sign-out,
access denied, and dictionary metadata inspection. Each event keeps its own
timestamp, operator when known, action, target, outcome, correlation ID, and
optional event-specific client context. The journal is not a raw operational
log and does not represent complete provider history.

Owner decision: collect the client IP and User-Agent in audit events and retain
events for one year. The schema stores IP as `inet`, bounds User-Agent to 1024
characters, and the nightly pg_cron task deletes events older than 365 days.
IP parsing trusts the immediate address supplied by the local reverse proxy;
forwarding headers must not be trusted from arbitrary clients. If a CDN or
another proxy is placed in front of Caddy, deployment must verify the trusted
proxy chain before interpreting the collected address as the originating
client. Required audit writes fail closed for the protected operation.
Tokens, cookies, authorization headers, request bodies, dictionary content,
and device fingerprints are excluded.

## Deployment boundary

The implementation appends migration 164 to the checked-in NUC contract.
`.github/workflows/deploy-nuc.yml` deploys
on pushes to `main` affecting application paths, so merging this application
work can initiate a deployment. No deployment or database change is authorized
by this implementation pass. Any later migration must be coordinated, assigned
to an issue, checksum-pinned, appended to the manifest with its postflight
contract, and kept compatible with app-image rollback.

The existing workflow builds before switching the UI container, verifies the
database contract, and restores the prior app image if post-switch health fails.
Forward database migrations remain applied during app rollback. A deployment
plan must preserve that contract and inspect the live NUC configuration without
exposing secrets before any rollout is proposed.

## Local review evidence

Screenshots under `apps/ui/reports/qa/admin-console/` include the development-
only fixture preview and live local UI captures with mocked API responses.
They compare the registry, metadata detail, journal, expired-session state,
desktop layout, and 390×844 mobile layout with Pencil v0.3. They are visual
evidence only; they do not prove real operator authorization or database-backed
reads.

The local UI health endpoint currently reports `database.target: local` but a
missing actual contract version, so it is not valid evidence for admin database
integration or shared learner RPC regression. Those checks must run after the
appropriate local DB contract is available and the auth/audit gates are
resolved.
