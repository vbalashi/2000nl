# Diagnostic report contract

Status: shaped for implementation under [#154](https://github.com/vbalashi/2000nl/issues/154), integrated with the review queue planned by [#51](https://github.com/vbalashi/2000nl/issues/51).

## Outcome

A signed-in learner can report a card, translation, loading, rendering, or Training-action problem even when delivery is interrupted. The app freezes one bounded report, saves it locally without blocking the learning flow, and eventually creates exactly one Feedback Item in the internal #51 queue. Production implementation is explicitly out of scope for this shaping document.

## Domain boundary

- One Report action creates one `Diagnostic Report` with a UUID `reportId`.
- The durable `Feedback Item` owns category, stable target, optional learner comment, review state, resolution, duplicate links, and optional GitHub follow-up.
- The temporary `Diagnostic Envelope` owns bounded card content and technical observations.
- A Diagnostic Report is not a Platform card mutation and does not reuse a review `clientEventId` or `turnId`.
- The server derives the authenticated user identity. The client never supplies a user ID.

## Envelope v1

The request is a closed, versioned schema. Unknown fields are rejected. Every field belongs to one classification; there is no extension metadata bag.

### Stable target

Exactly one primary target is required:

- `entry`: `entryId` plus content revision when available;
- `sense-card`: `entryId`, `cardTypeId`, and content/state revision when available;
- `content-node`: `entryId`, `contentNodeId`, node kind, and source-text fingerprint when available;
- `translation-artifact`: entry or content-node target, translation artifact ID, target language, and translation revision/policy identity when available;
- `training-action`: exact SenseCard target, action ID, action correlation ID, and result/error classification.

Source paths, visible headwords, array positions, card text, device data, timestamps, and diagnostics never constitute target identity.

### Feedback classification

`kind` is one of `content-quality`, `translation-quality`, `rendering`, `loading`, `training-action`, or `other`. A bounded optional learner comment is allowed. The implementation must select and document a Unicode-aware character/byte limit within the 64 KiB total envelope; the recommended v1 limit is 1,000 characters and 4 KiB UTF-8.

### Automatically attached card content

Submitting the report automatically includes the content of the currently reported card; there is no second consent checkbox. Permitted fields are the visible headword, definition, Usage Pattern, examples, idioms/notes, and displayed translations for the exact target card. Each field remains classified by semantic role and is independently bounded.

The collector receives an already-owned typed SenseCard projection. It must not inspect the DOM, clipboard, browser page, caches, another card, raw dictionary/provider payload, or neighboring application state. Total serialized envelope size is at most 64 KiB; overflow is truncated per field with explicit truncation flags, never by adding broader source data.

### Technical observations

- app and build version;
- client capture timestamp and timezone offset/name;
- normalized app route template such as `/training` or `/library`;
- recognized browser/OS family and major version, PWA mode, and online status;
- request/action/transition correlation IDs already owned by 2000NL;
- a bounded typed error chain;
- the allowlisted recent-event ring described below.

The server binds the authenticated principal and may expose only an internal pseudonym in the review queue. Client IP is not copied into the report.

## Hard redaction boundary

Safety comes from construction, not from attempting to scrub arbitrary input afterward.

The schema has no fields capable of accepting:

- passwords, access/refresh tokens, API/provider credentials, cookies, authorization headers, or arbitrary headers;
- `window.location.href`, query strings, fragments, referrer, browser history, other tabs, clipboard, DOM, screenshots, form values, storage dumps, console logs, HAR/network logs, or service-worker caches;
- raw request/response bodies, raw provider payloads, arbitrary URLs, raw User-Agent, or raw exception values/messages.

Routes are selected from an app-owned enum/template map. Browser/OS values are reduced to recognized categories. A typed builder accepts only explicit fields; it must not recursively serialize an error, HTTP object, component props, application state, or environment object. The server independently validates the closed schema, field limits, enum values, and total byte limit before persistence.

## Error chain

At most four causes are stored. Each cause may contain only:

- category: `network`, `timeout`, `auth`, `validation`, `provider`, `render`, `storage`, or `unknown`;
- allowlisted application stage and safe error code;
- HTTP status only, without headers or body;
- correlation ID;
- at most eight app-owned stack frames containing function name and relative build path.

An unknown error stores `unknown` plus a fingerprint of cleaned app-only frames. Raw messages and values are forbidden.

## Recent-event ring and performance

The app maintains an in-memory ring of at most 30 events covering at most the last two minutes and using at most 32 KiB. An event contains only an allowlisted stage, relative/duration timing, outcome, safe code, and correlation ID. It never contains arbitrary strings, content, URLs, request data, or response data.

Performance and UX invariants:

- recording an event performs no network, IndexedDB, React-state, or serialization work;
- event recording is p95 below 1 ms on target pilot mobile devices;
- card content is projected and the envelope serialized only after Report;
- local save and network delivery are asynchronous and never gate navigation, training, PWA close, or card transition;
- diagnostic failures are isolated and never fail the product operation being observed;
- the complete envelope is at most 64 KiB;
- comparative Training measurements with diagnostics enabled/disabled show no user-visible transition regression.

## Consent and learner visibility

The Report submission itself is consent to send the bounded current-card content and allowlisted diagnostics. The learner may add a comment but does not approve individual fields. There is no report-history or report-review UI.

The learner sees only transient delivery states on the current surface:

- saved locally for delivery;
- sent;
- unable to send now and will retry;
- permanently rejected by the current app/schema version.

The product must not claim that an internally reviewed problem was fixed or linked unless a future, separately shaped learner-facing history feature exists.

## IndexedDB outbox state machine

The frozen local record contains `reportId`, schema/app version, canonical payload bytes or an equivalent immutable value, payload hash, created/expiry timestamps, attempt count, retry timestamp, and send lease. It contains no token; current authentication is acquired only at send time.

```text
submit -> queued
queued -- eligible + online + authenticated --> sending
sending -- accepted/duplicate receipt --> delete locally + transient sent notice
sending -- offline/timeout/5xx --> retry_wait
sending -- auth unavailable --> retry_wait until session recovery
sending -- permanent schema/validation 4xx --> rejected
retry_wait -- due + online + authenticated --> sending
rejected -- newer app/schema version --> queued
queued|retry_wait|rejected -- age reaches 30 days --> delete locally
sending -- lease expires after crash/restart --> retry_wait
```

The application attempts delivery on submit, `online`, authenticated session recovery, and active-app resume. Background Sync is optional and invokes the same transition logic. Retries use exponential backoff with jitter, a floor of 60 seconds while active, and a cap of one hour. Only one sender may hold a record's lease.

## Idempotency

The client creates a UUID `reportId` once, before the first IndexedDB write, and freezes the canonical payload. Every transport retry reuses both. Editing an outbox record is forbidden; another intentional Report action gets a new ID.

The server enforces uniqueness in the authenticated principal's scope:

- unseen `reportId` plus valid payload creates one Feedback Item and one Diagnostic Envelope;
- same `reportId` and same canonical payload hash returns the original receipt without another row;
- same `reportId` and different payload returns an idempotency conflict and performs no write.

The client treats both the first accepted receipt and a matching duplicate receipt as delivery success and deletes the local record. Independent user reports are never automatically content-deduplicated; reviewers may mark Feedback Items as duplicates.

## Retention and access

- Accepted reports are deleted from IndexedDB immediately after a verified receipt.
- Undelivered local records expire after 30 days.
- The full server Diagnostic Envelope expires after 90 days.
- The durable Feedback Item remains after envelope deletion with category, stable target, review status, resolution, duplicate relationship, and optional GitHub link.
- Only an internal server-side review endpoint may read envelopes. Initial access is restricted to authenticated `admin` users; browser clients receive no direct table grants.
- The submitting learner cannot list or retrieve reports under v1.

Retention cleanup must be testable and must not depend on a reviewer manually closing the item.

## #51 review-queue integration

There is one queue, not a diagnostic queue beside a feedback queue. Each accepted report creates one Feedback Item with the shared statuses `new`, `triaged`, `linked-to-github`, `fixed`, or `ignored`. Reviewers can filter by kind, target, date, status, source client, build version, and safe error code; envelope contents are displayed separately and expire independently.

GitHub is never an automatic destination or raw diagnostic store. A reviewer may manually create a sanitized GitHub issue, then attach its URL to one or more Feedback Items and set `linked-to-github`. Raw envelope content, learner comments, user pseudonyms, and diagnostic dumps are not copied automatically.

## Implementation slices

1. Shared closed schemas, envelope builder, byte accounting, and redaction-negative fixtures.
2. Database Feedback Item + expiring Diagnostic Envelope storage, atomic/idempotent submit RPC, RLS/grants, receipt, cleanup, and admin review query.
3. Authenticated Next.js submission/review routes that derive the principal and enforce the same schema limits.
4. In-memory recent-event ring with benchmark instrumentation.
5. IndexedDB adapter plus pure outbox reducer/lease scheduler and resume/online/auth triggers.
6. Report affordance integration and transient delivery notifications without report history.
7. #51 reviewer query/UI or operational review surface and manual GitHub-link action.

Do not combine this work with FSRS semantics, translation generation policy, SenseCard redesign, or general telemetry.

## Required tests and evidence

- closed-schema allowlist and oversized-field/total-byte rejection;
- adversarial proof that tokens, cookies, headers, URL query/fragment, referrer, raw UA, DOM, clipboard, console/network logs, arbitrary errors, and unrelated card/browser data cannot be represented or persisted;
- exact target binding for entry, SenseCard, Content Node, translation artifact, and Training action;
- offline submit, restart/lease recovery, online/resume/auth recovery, backoff, Background Sync equivalence when present, and 30-day expiry;
- commit-then-disconnect followed by duplicate receipt, concurrent duplicate delivery, and same-ID/different-payload conflict;
- local deletion only after verified receipt;
- atomic creation of Feedback Item + Diagnostic Envelope and 90-day cleanup that preserves the Feedback Item;
- authenticated submit, server-derived user identity, non-admin denial, admin review access, and no direct browser table access;
- transient queued/sent/failed notices and uninterrupted Training/navigation;
- ring-buffer memory bound, event-write p95, envelope size, and enabled/disabled Training transition comparison on target mobile and desktop profiles.

## Prototype verdict

A throwaway in-memory reducer/TUI exercised accepted deletion, temporary failure and retry, expired sending-lease recovery after restart, version-gated retry of a permanent schema rejection, and 30-day expiry. The model remained representable with four persisted states (`queued`, `sending`, `retry_wait`, `rejected`) and no locally persisted success state. The prototype was deleted after this verdict was captured.

## Definition of ready

Implementation may start only when #51 adopts the shared Feedback Item identity/status contract or an implementation leaf explicitly delivers that prerequisite first. Each implementation leaf must name its owning layer, migrations/contracts, exact privacy and performance tests, and dependency order. No unresolved consent, visibility, retention, redaction, outbox, idempotency, or GitHub-integration decision remains in #154.
