# Connect opaque credentials — staged rollout (#735)

Status (2026-10-18): owner release authorization is recorded. The curator enables
the reviewed 229→230 **deployment phase**, under the explicit
[staged-cutover decision](../discussions/2026-10-18-02-connect-staged-cutover.md).
This supersedes the prior deployment HOLD, not the historical-boundary closure
hold. Key provisioning, the actual managed SQL chain and the supported Auth
retirement procedure have been verified for this phase. New issuer deployment
must precede retirement, so it establishes the cutoff rather than presupposing it.

After exact new-SHA/DB230/worker health, run the private reviewed Auth operator
procedure for the complete 19-user cohort, then independently verify zero
pre-cutoff native sessions. It uses a temporary purpose-bound session and global
logout; no password/metadata/user deletion or SMTP email. It updates Auth sign-in
audit/time, may replace outstanding magic links, and requires reconnection.
A private credential-free journal supports cleanup/resume on partial failure.

Historical JWT maximum lifetime remains UNKNOWN. This staged release does not
claim all previously issued access JWTs are rejected. Refresh-session retirement,
new-issuer correctness and final historical-token closure are separate receipts.

## New session configuration

Provision a dedicated random 32-byte `CONNECT_SESSION_ENCRYPTION_KEY` as exactly
64 hexadecimal characters through the server's secret management. Never use a
public variable, user credential, checked-in value, or fallback key. All replicas
must receive the same key before serving new sessions. Missing/invalid key fails
issuance closed. Existing ciphertext cannot be read after replacing the key;
rotation currently requires revoking/reconnecting opaque sessions, not silent
fallback to a native token. Do not log tokens, ciphertext, request bodies or keys.

Migration 229 is additive, service-role only, and needs exact checksum/postflight
review under the NUC DB deployment contract. The staged authorization does not bypass its exact validation.
Postflight: columns/constraints present; anon/authenticated cannot read/update
session rows, service_role can; claimed code/refresh has one winner; revoke racing
refresh cannot revive access. Disposable validation:

`LOCAL_SUPABASE_DB_URL=<local-only URL> node --test db/scripts/connect_credentials.integration.test.mjs`

## Mandatory legacy retirement before claiming closure

1. Stop legacy issuance/refresh on every replica and prevent rollback to the old
   issuer. Preserve the cutoff and a secure, complete historical cohort record.
2. Determine whether the affected-user list is provably exhaustive. Current
   connected_client_sessions alone is insufficient: deleting clients cascades
   and can erase tracking, and directly refreshed native descendants are untracked.
   If completeness cannot be established, broaden retirement under explicit
   operator authorization instead of assuming an affected-only list is complete.
3. Verify the chosen supported Auth administrative revocation procedure against
   disposable local GoTrue, then prepare a concrete reviewable operator plan.
   Revoke all potentially delegated native sessions and refresh descendants;
   first-party sessions of affected users may also need termination because
   original session IDs were not retained. Never delete production auth.sessions
   as an incidental migration, test or bootstrap side effect.
4. Verify revoked credentials cannot refresh. Wait the maximum lifetime of all
   historically issued native JWTs after retirement, plus clock skew, or use a
   separately reviewed equivalent. The current expiry setting alone is inadequate
   if longer JWTs were previously issued. Shortening a setting is not retroactive.
5. Record cutoff, coverage rationale, revocation evidence and expiry horizon
   without secrets. Only then can the curator clear the historical-boundary hold.
   Validate direct Auth/Data API rejects opaque tokens and retired native tokens,
   and read-only opaque session cannot mutate or approve new consent.

Both Pontix and AudioFilms store opaque strings and use Connect refresh, so the
wire shape is compatible. They must reconnect after legacy retirement and after
30-day expiry or an indeterminate refresh. Without offline_access, access ends
at access-token expiry. Native-only first-party endpoints are not Connect APIs.
No neighboring repository edits are included.

## Failure and rollback

Stop Connect issuance if provisioning, migration, or validation fails. The
additive schema may remain. Never roll back to native credential issuance after
retirement: that reopens the boundary. A safe application rollback must keep
Connect disabled or preserve the opaque issuer/resolver. Key loss requires
reconnection. A failed claim/finalize cannot return unrecorded credentials;
consumed refresh returns invalid_refresh_token and requires reconnection.

## Prepared postflight chain (local only)

`read-only-postflight-229.sql` chains the existing 228 read-only contract and the
opaque credential storage probe. `postflight-229.sql` delegates to that read-only
wrapper. The local release integration now registers the real ordered 228 → 229 → 230
migrations with exact checksums and expected app contract230, while keeping the
deployment manifest enabled for the staged cutoff/retirement phase. Historical closure remains open.
Migration229 checksum remains
`82a7ae382d8f703fdffc0d25a5b2dbadce6a49374847e8faaae386f14d287dc2`.
The earlier private/pre-release digest
`71ee1d7fd07c0f1859e2d15da9e19464dc07648f49289c2fd2e0fb50489c2848`
was superseded before registration/publication: managed gate validation required
one standalone BEGIN/COMMIT wrapper. The correction adds only that transaction
framing; schema/grants semantics are unchanged. Do not use the superseded digest
for release receipts.
The stats workstream validates the combined chain on its owned disposable local
DB; wrapper availability alone is not evidence of a production rollout. Passing
this schema/storage chain does **not** establish legacy Auth retirement, maximum
JWT expiry, key provisioning or client reconnection, and does not clear the historical-boundary closure hold.


## Automatic rollback boundary

Every opaque-v2 production runner carries image label
`io.2000nl.connect-credentials=opaque-v2`. Before making a rollback image ready,
the deployment workflow inspects the immutable previous image's marker. Missing,
empty or unrecognized markers prohibit restoration: the first opaque cutover must
never automatically revive the old native credential issuer. If that cutover
fails after switching, the existing failure branch stops the new UI and worker
and reports that operator action is required; forward DB migrations remain.

Future failures may restore a previous image only when it already carries the
opaque-v2 marker. The marker is compatibility metadata, not evidence of legacy
retirement or a release-hold override. A failure before switching leaves the
currently running app untouched. The manifest is enabled only for the documented staged cutoff/retirement phase.
