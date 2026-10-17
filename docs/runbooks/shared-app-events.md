# Shared application events (#731)

## Runtime contract

`apps/ui/lib/events/appEvents.ts` uses the existing browser Supabase client.
`appEventRegistry.ts` owns validation, topic refcounts, bounded deduplication and
connection lifecycle. Topic handlers must re-read authoritative data and retain
ready UI while doing so. Never send grades, settings commands or receipts over
Broadcast. Never add a second browser Supabase client for a feature.

| Private topic | Event kinds | Authoritative source |
| --- | --- | --- |
| `app:user:<auth UUID>` | `training.changed`, `learning.changed`, `account.changed`, `collections.changed` | Actual database row mutations |
| `app:translation:<entry UUID>:<language>` | `translation.ready`, `translation.failed` | Translation cache publication / terminal job failure |
| `app:releases` | `release.available` | Deploy helper after exact build health verification |

Payload schema: `version: 1`, UUID `eventId`, `kind`, ISO `occurredAt`, optional
`resourceId`, `language`, `revision`. User-domain hints may omit resourceId:
consumers then invalidate their domain, not an entry whose ID is unknown.
Transaction-local coalescing limits repeated hints for bulk changes. Revisions
are hints, not sortable global sequence numbers. After reconnect, reconcile
current projections instead of assuming every intermediate event was delivered.

The DB policy allows only the current user's topic, authenticated release hints,
and translation topics for dictionaries they can read. Client Broadcast writes
are denied for application topics. Private topic permission is cached by Realtime
at join; token refresh rejoins, and authoritative reads enforce current access.
Hints contain no translation content, card text, auth token or learner result.
Immediate eviction of an already joined channel on arbitrary ACL revocation is
not promised by this version.

## Rollout and checks

Migration 228 owns policies, trigger publishers and service-only release RPC.
Use the canonical DB contract deployment procedure and its checksum/postflight;
never edit managed `realtime` objects or apply production DDL through a connector.
`realtime.send` and `realtime.messages` must already exist. Delivery failure must
not fail an otherwise valid user write; inspect `app_event_delivery_failed`
warnings and client connection status when diagnosing missing hints.

`node scripts/publish-app-release.mjs <40-character-commit> <server-env-file>`
uses server credentials, never browser credentials. The deployment workflow calls
it only after health verifies the exact commit. Failure logs a generic warning
and does not roll back a healthy release. Reconnect/focus/sparse checks recover.

## Self-hosting

Use the complete compatible Supabase stack including Realtime v2, database
Broadcast migrations/functions, Auth/JWT and WebSocket proxy. Update the existing
Supabase URL/key configuration through normal deployment. No managed hostname is
embedded in event consumers. A plain PostgreSQL installation lacks the delivery
service. Preserve policies and server-only service-role credentials. Check
private join authorization and actual DB-to-WebSocket delivery before cutover.

This mechanism is a best-effort invalidation channel, not durable replay,
background push to closed tabs, or a notification inbox. Sharing membership and
future folder subscription semantics remain separately tracked in #684.

## Local validation

With dependencies bootstrapped in the issue worktree, the disposable SQL test is
`node --test db/scripts/shared_app_events.integration.test.mjs` with the local
wrapper environment loaded. It creates and removes its own database. The real
service smoke additionally uses `APP_EVENTS_REALTIME_SMOKE=1 node --test --test-force-exit
db/scripts/shared_app_events.realtime.test.mjs` after migration 228 is installed
on the local Supabase stack. Both refuse non-loopback targets. The smoke creates
throwaway users and a private dictionary/entry, checks actual WebSocket delivery
and foreign/anonymous denial, then cleans up in `finally`. Never run these tests
against production or an owner's learning data.

The smoke runner uses Node’s force-exit-after-tests option because rejected
Realtime channel retries can retain SDK timers after all assertions and cleanup.
It does not skip awaiting resource cleanup or permit non-local targets.
