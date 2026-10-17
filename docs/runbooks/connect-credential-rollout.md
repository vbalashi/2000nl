# Connect opaque credentials — held rollout (#735)

Status: local implementation only. No remote publication, deployment, Auth
revocation or migration-manifest enablement is authorized by this runbook.
The curator coordinates review and final operator authorization.

## New session configuration

Provision a dedicated random 32-byte `CONNECT_SESSION_ENCRYPTION_KEY` as exactly
64 hexadecimal characters through the server's secret management. Never use a
public variable, user credential, checked-in value, or fallback key. All replicas
must receive the same key before serving new sessions. Missing/invalid key fails
issuance closed. Existing ciphertext cannot be read after replacing the key;
rotation currently requires revoking/reconnecting opaque sessions, not silent
fallback to a native token. Do not log tokens, ciphertext, request bodies or keys.

Migration 229 is additive, service-role only, and needs exact checksum/postflight
review under the NUC DB deployment contract. Do not bypass its current hold.
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
