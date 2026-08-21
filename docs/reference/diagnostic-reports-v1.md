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
Report/Melden UI, reviewer UI, or automatic GitHub linking. Displayed
translation atoms fail closed until the translation-artifact reconstruction
slice can verify their exact persisted projection. All new card-content reports
currently fail closed because the database has no single atomic projection for
content/card/state revisions, semantic atom order, idiom ownership, and bounded
truncation. Only the pre-card `app-operation` tracer is accepted in this slice.

### Displayed-translation identity gap in the shaped schema

The #154 v1 atom shape identifies a displayed translation only by
`contentNodeId` (or `null`) and text. It does not carry `translationId`,
`targetLanguageCode`, policy version, or provider revision. A connected client
also has no server-bound first-party translation preference. Consequently, for
a report whose primary target is not itself `translation-artifact`, the server
cannot uniquely reconstruct which translation was displayed when multiple
languages or revisions exist. #190 must not infer that identity from text or
client labels, so connected reports containing displayed-translation atoms fail
closed.

The minimal future contract choices are either (a) give every displayed-
translation atom its stable translation-artifact identity, or (b) introduce a
server-owned connected-session presentation preference and bind the report to
its revision. Choice (a) is self-contained evidence; choice (b) is smaller on
the wire but adds mutable session state and needs offline/stale semantics.
Neither choice exists in #154, so #190 does not silently select one.
In addition, current Platform V2 derives a node-translation ID as a 64-character
SHA-256 digest, whereas #154 requires a UUID. Real node-translation targets
therefore cannot pass the v1 schema until Platform adopts durable UUID identity
or the report contract is versioned; they fail closed here.

The existing Platform action receipt has a similar historical limitation. It
stores the complete request only as an opaque hash, while the event row stores
entry/card/action/result but not the complete original `stateRevision` request.
#154 correctly says a later current state must not invalidate a Training-action
report, so comparing with current state would be wrong. Training-action targets
therefore fail closed. Exact verification needs either (a) a receipt migration
that stores the closed original action request projection, or (b) a separately
versioned verification digest whose inputs are exactly the reportable target
fields. The former is directly reviewable but stores more durable structure;
the latter is smaller but must be introduced at action time and versioned. It
is not inferred in #190.

The private Content Node identity table also stores a full-source SHA-256
fingerprint but not the canonical source text. Although the Next boundary can
rebuild a typed projection, a route-only comparison would introduce a TOCTOU
window and cannot attest the transaction that stores the report. The DB cannot
prove that a truncated submitted prefix came from that full source, and it has
no canonical semantic atom priority/idiom-ownership projection. The DB
therefore fails all new card-content reports closed rather than accepting an
arbitrary ordering or `truncated: true` text.
Closing this storage-boundary gap requires either persisting versioned bounded
canonical node text in the private projection or introducing a DB-verifiable
server attestation; #190 selects neither implicitly.

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
