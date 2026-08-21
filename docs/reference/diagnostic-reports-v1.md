# Diagnostic Report v1 implementation contract

Issue [#190](https://github.com/vbalashi/2000nl/issues/190) implements the first
durable tracer shaped in the [full privacy contract](../architecture/diagnostic-report-contract.md).

## Boundaries

- `packages/shared/diagnostic-report/v1.ts` is the closed schema, canonical JSON
  encoder, SHA-256 transport hash verifier, and bounded typed builder.
- `POST /api/feedback/reports` authenticates before parsing, requires
  `platform:write` from connected clients, derives user/client/build metadata,
  verifies the frozen hash, and invokes the service-only atomic RPC.
- `GET /api/admin/feedback` is first-party admin-only and provides bounded
  filters. Tables have no browser-readable policy or grant.
- `feedback_items` retains durable classification. `diagnostic_envelopes`
  contains comment/card evidence and expires after 90 days; scheduled callers
  invoke `delete_expired_diagnostic_envelopes`.

`app-operation` remains part of v1 intentionally: #154 names it as the only
stable target for loading failures that happen before a card exists and requires
`cardContent: null` so a stale previously visible card is never borrowed.

The tracer deliberately does not include the offline outbox, event recorder,
Report/Melden UI, reviewer UI, or automatic GitHub linking. It now accepts all
six stable target kinds by composing three deployed trust boundaries rather
than rebuilding their semantics:

- #199 supplies the principal-scoped `reportContentRevision` and the DB-owned
  ordered, NFC-normalized, bounded source-card atom projection. The submission
  transaction reconstructs it again and rejects stale revisions, changed
  order/text/truncation, and inaccessible entries.
- #198 supplies the immutable original Training-action request projection.
  An exact receipt produces server-derived `commitState: committed`; a missing
  receipt can produce `not-found` only for non-success client observations.
  Existing-but-old or mismatched receipts fail closed.
- #197 supplies the closed displayed Translation Artifact identity, including
  SHA-256 node translation IDs. The authenticated server resolves the current
  typed Platform projection and accepts only the exact non-empty `ready`, fresh
  artifact selected by both renderer and Report capability. The RPC binds the
  target to the stored ready artifact and current Content Node fingerprint.

Every `displayed-translation` atom therefore contains its exact closed
`artifact` object. Source atoms keep the four-key source shape. The server never
infers language, provider revision, source path, or artifact identity from text
or client preferences. Old UUID-shaped node translation IDs, stale artifacts,
unknown fields, altered translation text, or multiple target languages fail
closed before persistence.

## Receipt and idempotency

The identity scope is authenticated user plus `reportId`. A durable receipt is
retained independently from the 90-day envelope. A matching hash
returns the original Feedback Item as `duplicate`; a different hash returns
`idempotency_conflict` without writing. The client must freeze and reuse both
values for retries. Accepted and duplicate responses return the same original
`acceptedAt`, including after evidence retention cleanup.

After authentication and canonical hash verification, the submit route checks
that durable receipt before any current-state projection. This is necessary:
an identical retry remains the same accepted report even when the referenced
card has since changed. The database repeats the receipt check under a
per-principal/report advisory lock, so concurrent first deliveries cannot
create two Feedback Items and a competing hash cannot bypass the conflict.

No token, cookie, header, URL, DOM/storage/console/network dump, raw provider
payload, raw user agent, or arbitrary error message is representable in the
automatic schema. The bounded learner comment and verified current-card atoms
are the only untrusted 90-day evidence classes.
