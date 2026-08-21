# Diagnostic report contract

Status: shaped for implementation under [#154](https://github.com/vbalashi/2000nl/issues/154), integrated with the review queue planned by [#51](https://github.com/vbalashi/2000nl/issues/51).

## Outcome

A signed-in learner can report a card, translation, loading, rendering, or Training-action problem even when delivery is interrupted. The app freezes one bounded report, saves it locally without blocking the learning flow, and eventually creates exactly one Feedback Item in the internal #51 queue. Production implementation is explicitly out of scope for this shaping document.

## Domain boundary

- One Report action creates one `Diagnostic Report` with a UUID `reportId`.
- The durable `Feedback Item` owns category, stable target, whether a learner
  comment was supplied, an optional admin-authored sanitized summary, review
  state, resolution, duplicate links, and optional GitHub follow-up.
- The temporary `Diagnostic Envelope` owns two untrusted-but-consented evidence
  classes—the bounded learner comment and exact authorized current-card
  content—plus allowlisted technical observations.
- A Diagnostic Report is not a Platform card mutation: `reportId` is its sole
  delivery/idempotency identity and it never uses a review `clientEventId` or
  `turnId` as that identity. A `training-action` target references the already
  owned `clientEventId` only to correlate the report with the original action;
  it is never regenerated for reporting.
- The server derives the authenticated user identity. The client never supplies a user ID.

## Envelope v1

The request is a closed, versioned schema. Unknown fields are rejected. Every field belongs to one classification; there is no extension metadata bag.

The canonical payload contains exactly `schemaVersion`, `reportId`, `feedback`,
`target`, `sourceContext`, `cardContent`, and `observations`; `schemaVersion` is the literal
`diagnostic-report-v1` and `reportId` is a UUID. Transport adds `payloadHash`, a
lower-case SHA-256 hex digest of those canonical payload bytes. Optional
properties below are present as explicit `null`, never omitted. Arrays preserve
source order. Canonical JSON recursively sorts object keys, uses UTF-8 without
a byte-order mark or insignificant whitespace, and uses JSON integer syntax for
numbers. The server reconstructs the canonical payload bytes and verifies the
transport hash before persistence.

### Stable target

Exactly one primary target is required. IDs described as UUIDs must be canonical
lower-case UUID strings; content/source fingerprints are lower-case
64-character SHA-256 hex strings. Platform-owned fields retain their existing
Platform V2 types:

- `entry`: `entryId` UUID and required `contentRevision`;
- `sense-card`: `entryId`, `cardTypeId` (1–64 ASCII identifier characters),
  required `contentRevision`, and `stateRevision` (UUID or literal `untracked`);
- `content-node`: `entryId`, `contentNodeId` (1–128 ASCII identifier
  characters), `nodeKind` from the Platform V2 enum, and required
  `sourceTextFingerprint`;
- `translation-artifact` is a discriminated union. An entry translation has
  `targetKind: entry`, `entryId`, `contentNodeId: null`, `translationId` UUID,
  required `sourceContentFingerprint`, BCP-47 `targetLanguageCode` (2–35
  characters), `translationPolicyVersion` (1–128 printable ASCII characters),
  and `providerRevision` (same bound or `null`). A node translation has
  `targetKind: content-node`, `entryId`, required `contentNodeId`,
  `translationId`, required `sourceTextFingerprint`, and the same language and
  policy fields;
- `training-action`: the exact Platform SenseCard target (`entryId`,
  `cardTypeId`, `stateRevision` UUID/`untracked`), semantic Platform `actionId`
  (`start-learning`, `mark-known`, `undo-known`, or `review-card`), the reused
  `clientEventId` UUID, `reviewResult` (`fail`, `hard`, `success`, or `easy`) for
  `review-card` and `null` otherwise. For `undo-known`, `activeKnownMarkId` and `knownMarkRevision` are
  required UUIDs; for every other action both are explicit `null`. A separate
  required `contentRevision` binds any attached card atoms but is not part of
  the historical Platform action identity;
- `app-operation`: route, stage from the observation-stage enum below,
  required `operationCorrelationId` UUID, and optional related `entryId`. This
  is the only target for loading/reportable operations that fail before a card
  exists; it never borrows the previous visible card identity.

Source paths, visible headwords, array positions, card text, device data, timestamps, and diagnostics never constitute target identity.

For source-card atoms, Platform lookup supplies a nullable opaque
`reportContentRevision` derived by the DB-owned ordered source-atom projection.
The Diagnostic Report target places that value in its `contentRevision` field;
it is deliberately distinct from the general SenseCard presentation
`contentRevision`. A null report revision means automatic source-card atoms are
not independently verifiable and submission with `cardContent` fails closed.
Displayed Translation atoms retain their separate Translation Artifact
revision from #197.

### Connected-client source context

`sourceContext` is `null` for first-party reports. Connected clients may send
only this exact object (all listed keys required; nullable values explicit):

```text
{
  contractVersion: "diagnostic-source-context-v1",
  source: {
    kind: "youtube_video",
    provider: "youtube",
    externalId: /^[A-Za-z0-9_-]{11}$/,
    languageCode: BCP-47 (2–35 ASCII characters) | null
  },
  location: null | {
    kind: "caption_phrase",
    startMs: integer 0..86400000 | null,
    endMs: integer 0..86400000 | null,
    phraseIndex: integer 0..2147483647 | null,
    locatorConfidence: "canonical" | "derived" | "approximate" | null
  }
}
```

When both times exist, `endMs >= startMs`. A connected client may derive this
projection from its `PlatformSourceContextV2`, but the diagnostic route performs
independent strict raw-key validation at the root and every nested object
*before* normalization; it does not rely on the existing permissive Platform
parser, which may strip unknown keys. It also verifies the connected principal.
Non-YouTube sources, source-context v1/unknown versions, artifact/selection
objects, free-form context/observation/diagnostics, URLs, and every unknown key
are rejected. The complete accepted object is durable on the Feedback Item as
the bounded useful YouTube identity/location; no broader source evidence is
stored by Diagnostic Report v1.

### Feedback classification

`feedback` contains `kind`, `problemType`, and `comment`. `kind` is one of
`content-quality`, `translation-quality`, `rendering`, `loading`,
`training-action`, or `other`. `problemType` must belong to the selected kind:

- content: `wrong-sense`, `bad-generated-definition`, `other-content`;
- translation: `bad-headword-translation`, `bad-definition-translation`,
  `bad-example-translation`, `other-translation`;
- rendering: `rendering-layout-issue`;
- loading: `loading-failure`;
- training action: `training-action-failure`;
- other: `other`.

`comment` is `null` or at most 1,000 Unicode scalar values and 4,096 UTF-8
bytes after NFC normalization. Over-limit comments are rejected rather than
silently truncated.

The comment is the only intentionally free-form, untrusted field. The Report
dialog warns: “Describe the problem; do not include passwords, tokens, contact
details, or private links.” The comment is never copied into the durable
Feedback Item, logs, telemetry, search indexes, or GitHub. It remains only in
the access-controlled 90-day envelope. An admin may write a separate sanitized
review summary after inspection; that summary is bounded to 1,000 Unicode
scalar values / 4,096 UTF-8 bytes and is never derived automatically.

### Automatically attached card content

Submitting the report automatically includes the content of the currently reported card; there is no second consent checkbox. Permitted fields are the visible headword, definition, Usage Pattern, examples, idioms/notes, and displayed translations for the exact target card. Each field remains classified by semantic role and is independently bounded. For an `app-operation` that failed before a card existed, there is no card to attach and `cardContent` is `null`; the Report UI states that only operation diagnostics will be sent.

Exact authorized card text is untrusted-but-consented 90-day evidence. A source
dictionary or private user entry can legitimately contain a URL, credential-like
word, or other arbitrary lexical text. The privacy guarantee is provenance:
the collector and server include only the exact authorized current-card
projection and never inspect credentials, browser/storage state, or unrelated
content. Card text is never copied into the durable Feedback Item or GitHub.

`cardContent` is either `null` or an object `{ atoms, omittedAtomCount }`. It is
`null` only for an `app-operation` with no current-card target. `atoms` is an
ordered array of typed atoms. Atom roles are `headword`,
`definition`, `usage-pattern`, `example`, `idiom`, `idiom-explanation`,
`usage-note`, and `displayed-translation`. Every atom contains `role`, stable
`contentNodeId` or `null`, NFC `text`, and `truncated`. The maximums are 32
atoms, 1,500 Unicode scalar values and 6,000 UTF-8 bytes per atom, and 48 KiB
for the canonical serialized `cardContent` value. The builder considers atoms
in this deterministic priority order: headword; definition; Usage Pattern;
each idiom root followed by its owned explanation and examples in source order;
standalone examples; usage notes; displayed translations. It clips arrays to
the first items in that order, truncates an over-limit atom at a Unicode-scalar
and UTF-8 boundary, sets `truncated: true`, and stops before the next atom once
the 48 KiB budget is exhausted. `omittedAtomCount` inside `cardContent` records
the exact remainder.

The collector receives an already-owned typed SenseCard projection. It must not inspect the DOM, clipboard, browser page, caches, another card, raw dictionary/provider payload, or neighboring application state. Total serialized envelope size is at most 64 KiB; overflow is truncated per field with explicit truncation flags, never by adding broader source data.

The server does not trust submitted atom text. Before persistence it authorizes
the stable target for the authenticated principal, resolves the exact current
Platform V2 projection/revision and translation artifact, and reconstructs the
allowlisted atoms. Submitted atoms must exactly match that ordered projection
after the specified NFC/truncation algorithm. Inaccessible, stale, unknown,
duplicate, reordered, or mismatched atoms fail closed and nothing is written.
For an offline report whose frozen revision is no longer resolvable, the server
returns the permanent `stale-target` rejection; v1 does not persist unverifiable
historical text as automatic card content.

For a `training-action` target, action verification is deliberately historical,
not a comparison with the current card state. The server looks up the
principal-scoped immutable action receipt/history by `clientEventId`, compares
the submitted action ID, original SenseCard target, review result, and
undo-known fields with the recorded request, and derives server enrichment
`commitState: committed` from that record. `commitState` is never a client
request field or target property and is excluded from canonical payload
bytes/hash. A forged `commitState` is rejected as an unknown field. A later
`stateRevision` is expected after a
committed action and does not invalidate the report. The receipt does not claim
whether the client saw the first accepted response or a duplicate retry, so the
separate bounded `clientObservedOutcome` retains either observation. If no
receipt exists, the server enriches the stored record with `commitState:
not-found` and may retain the
client-observed `state-conflict`, `network`, `timeout`, `server-error`, or
`unknown`; `accepted` or `duplicate` without a receipt is rejected. A 409 state
or known-mark conflict is therefore reportable but explicitly non-authoritative.
Any cross-user receipt or mismatched target/event pair is rejected. Attached
card atoms are verified separately against `contentRevision`.

### Technical observations

The canonical `observations` object contains exactly the following. For a
`training-action` target it also contains required `actionObservation` with
exactly `clientObservedOutcome` (`accepted`, `duplicate`, `state-conflict`,
`network`, `timeout`, `server-error`, or `unknown`); for every other target
`actionObservation` is `null`. App/build
version and connected-client identity/version are not client strings: the
server derives them from the deployed build and authenticated client registry,
then stores them as server metadata beside the accepted envelope.

- `capturedAt` as UTC RFC 3339 with milliseconds, timezone offset as an integer
  from -840 through 840 minutes, and an IANA timezone name of at most 64 ASCII
  characters that must canonicalize through the runtime timezone registry;
- route from `training`, `library`, `statistics`, `settings`, or `unknown`;
- browser family from `chromium`, `safari`, `firefox`, or `unknown`, browser
  major version as a non-negative integer or `null`, OS family from `android`,
  `ios`, `macos`, `windows`, `linux`, or `unknown`, OS major version as a
  non-negative integer or `null`, plus Boolean PWA and online states;
- at most eight UUID request/action/transition correlation IDs already owned by
  2000NL;
- a bounded typed error chain;
- the allowlisted recent-event ring described below.

The server binds the authenticated principal and durable `sourceClient`: the
literal `2000nl-web` for the first-party app or the authenticated connected
client ID for Platform callers. Neither is accepted from the request. The
review queue may expose only an internal user pseudonym. Client IP is not copied
into the report.

The first-party session route uses the existing authenticated web principal.
Connected-client submission requires `platform:write`; missing or wrong scope
returns 403 before validation or persistence. A future narrower feedback scope
requires its own contract revision rather than silently weakening this rule.

## Hard redaction boundary

Safety comes from construction, not from attempting to scrub arbitrary input afterward.

Automatically collected technical fields have no slots capable of accepting:

- passwords, access/refresh tokens, API/provider credentials, cookies,
  authorization headers, or arbitrary headers in automatically collected
  fields (the separately classified untrusted learner comment may contain text
  the learner types and is handled by its warning/access/retention boundary);
- `window.location.href`, query strings, fragments, referrer, browser history, other tabs, clipboard, DOM, screenshots, form values, storage dumps, console logs, HAR/network logs, or service-worker caches;
- raw request/response bodies, raw provider payloads, arbitrary URLs, raw User-Agent, or raw exception values/messages.

This statement does not inspect or ban lexical substrings inside the two
explicit untrusted evidence classes (learner comment and exact authorized card
text). Their warning/provenance/access/90-day retention rules apply instead.

Routes are selected from an app-owned enum/template map. Browser/OS values are reduced to recognized categories. A typed builder accepts only explicit fields; it must not recursively serialize an error, HTTP object, component props, application state, or environment object. The server independently validates the closed schema, field limits, enum values, and total byte limit before persistence.

## Error chain

At most four causes are stored. Each cause may contain only:

- category: `network`, `timeout`, `auth`, `validation`, `provider`, `render`, `storage`, or `unknown`;
- observation stage and safe error code from the closed enums below;
- HTTP status only, without headers or body;
- correlation ID;
- at most eight lower-case SHA-256 `appFrameFingerprint` values. Raw function
  names and paths are never accepted.

An unknown error stores `unknown` plus a fingerprint of cleaned app-only frames. Raw messages and values are forbidden.

The observation-stage enum is `lookup-selection`, `lookup-fetch`,
`translation-cache`, `translation-provider`, `audio-cache`, `audio-provider`,
`review-mutation`, `transition-render`, `report-capture`, `report-persist`, and
`report-send`. The safe-code enum is `network-interrupted`, `timeout`,
`unauthorized`, `forbidden`, `validation-rejected`, `provider-unavailable`,
`render-failed`, `storage-failed`, and `unknown`. Correlation IDs are UUIDs;
HTTP status is an integer from 100 through 599 or `null`. No automatically
collected free-form string slot remains.

## Recent-event ring and performance

The app maintains an in-memory ring of at most 30 events covering at most the last two minutes and using at most 32 KiB. An event contains only an allowlisted stage, relative/duration timing, outcome, safe code, and correlation ID. It never contains arbitrary strings, content, URLs, request data, or response data.

Relative and duration timings are integer milliseconds from 0 through 120,000.
Outcome is `started`, `succeeded`, `failed`, `cancelled`, or `unknown`; safe code
and correlation identity use the bounds above. At report time the builder keeps
the newest 30 eligible events, then drops oldest events until their canonical
array is at most 32 KiB.

Performance and UX invariants:

- recording an event performs no network, IndexedDB, React-state, or serialization work;
- event recording is p95 below 1 ms on target pilot mobile devices;
- card content is projected and the envelope serialized only after Report;
- local save and network delivery are asynchronous and never gate navigation, training, PWA close, or card transition;
- diagnostic failures are isolated and never fail the product operation being observed;
- the complete canonical envelope is at most 65,536 UTF-8 bytes; the client
  builder must satisfy this after the deterministic final pass below and the
  server rejects any larger request;
- comparative Training measurements with diagnostics enabled/disabled show no user-visible transition regression.

### Final envelope byte budget

The builder first materializes all fixed metadata, target, feedback (including
the bounded comment), and error chain. If those fixed fields alone exceed
65,536 bytes, local submission is rejected as `payload-too-large`. It then adds
card atoms in the priority order above, testing the exact canonical payload
size after each candidate. Finally it adds recent events newest-first under the
same exact-size test. It records `omittedAtomCount` and `omittedEventCount`;
these counters are part of `cardContent` and `observations` respectively and
are recalculated before every size test. A candidate is retained only when the
resulting canonical payload is at most 65,536 bytes. No approximate reservation
or post-freeze repair is used.
This single final pass supersedes component maxima when their sum is larger;
there is no server-valid combination that the client freezes above the total
limit.

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
queued|retry_wait|rejected -- age reaches 30 days --> delete locally
sending -- lease expires after crash/restart --> retry_wait
```

The application attempts delivery on submit, `online`, authenticated session recovery, and active-app resume. Background Sync is optional and invokes the same transition logic. Retries use exponential backoff with jitter, a floor of 60 seconds while active, and a cap of one hour. Only one sender may hold a record's lease. `rejected` is terminal for the frozen record; an app upgrade does not retry it. A later intentional Report action creates a new `reportId` and current-schema payload.

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
- The durable Feedback Item remains after envelope deletion with category,
  stable target, `commentPresent`, optional admin-authored sanitized summary,
  review status, resolution, duplicate relationship, and optional GitHub link;
  the raw learner comment expires with the envelope.
- Only an internal server-side review endpoint may read envelopes. Initial access is restricted to authenticated `admin` users; browser clients receive no direct table grants.
- The submitting learner cannot list or retrieve reports under v1.

Retention cleanup must be testable and must not depend on a reviewer manually closing the item.

## #51 review-queue integration

There is one queue, not a diagnostic queue beside a feedback queue. Each accepted report creates one Feedback Item with the shared statuses `new`, `triaged`, `linked-to-github`, `fixed`, or `ignored`. Reviewers can filter by kind, target, date, status, source client, build version, and safe error code; envelope contents are displayed separately and expire independently.

The atomically created Feedback Item stores `reportId`, server-derived reporter
identity and `sourceClient`, `kind`, `problemType`, the complete stable target,
`commentPresent`, nullable admin-authored `sanitizedSummary`, status `new`, and
created/updated timestamps. Resolution, duplicate relation, and GitHub link are
initially `null`. This is the #51
durable classification; broad `kind` supports queue partitioning and
`problemType` preserves its granular translation/content problem types.
For `training-action`, the server also stores derived `commitState` as
`committed` or `not-found` beside—not inside—the immutable submitted target and
may return it in the acceptance receipt.
For a validated YouTube source it also retains the durable source/location
subset defined above; all other source-context evidence expires with the
envelope.

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
- adversarial proof that tokens, cookies, headers, URL query/fragment, referrer,
  raw UA, DOM, clipboard, console/network logs, arbitrary errors, and unrelated
  card/browser data cannot be collected from or smuggled through automatic
  technical fields; exact authorized card atoms and the warned learner comment
  remain the only untrusted 90-day evidence classes;
- exact target binding for entry, SenseCard, Content Node, translation artifact,
  Training action, and pre-card app operation without borrowing a stale card;
- target authorization and server-side atom reconstruction/exact-match,
  including inaccessible, stale, reordered, duplicate, translation-mismatch,
  and private-entry negative cases;
- action-union fixtures for review and undo-known, translation-union fixtures
  for entry/content-node fingerprints, and source-context fixtures for accepted
  YouTube projection plus rejected v1, non-YouTube, arbitrary URL/context text,
  and unknown keys at every nesting level;
- offline submit, restart/lease recovery, online/resume/auth recovery, backoff, Background Sync equivalence when present, and 30-day expiry;
- commit-then-disconnect followed by duplicate receipt, concurrent duplicate delivery, and same-ID/different-payload conflict;
- training-action receipt verification for accepted-then-disconnect, duplicate,
  no-receipt state/known-mark conflict, unknown/uncommitted action, mismatched
  target/clientEventId, forged accepted/duplicate without receipt, and
  cross-user receipt access;
- commit-then-disconnect freezes a network/timeout observation; server receipt
  lookup stores `commitState: committed` without modifying canonical payload
  bytes/hash, and duplicate delivery returns the same enrichment;
- local deletion only after verified receipt;
- atomic creation of Feedback Item + Diagnostic Envelope and 90-day cleanup that preserves the Feedback Item;
- authenticated submit, server-derived user identity, non-admin denial, admin review access, and no direct browser table access;
- connected-client submit requires `platform:write`; missing/wrong scope is
  denied before validation or persistence;
- smuggling negatives cover every automatically collected string position;
  app/build/client versions are server-derived, stage/code/browser/OS are enums,
  timezone names must resolve canonically, frame values are SHA-256 only, and
  source context is strict raw-key validated;
- transient queued/sent/failed notices and uninterrupted Training/navigation;
- ring-buffer memory bound, event-write p95, envelope size, and enabled/disabled Training transition comparison on target mobile and desktop profiles.

## Prototype verdict

A throwaway in-memory reducer/TUI exercised accepted deletion, temporary failure and retry, expired sending-lease recovery after restart, terminal permanent schema rejection, and 30-day expiry. The model remained representable with four persisted states (`queued`, `sending`, `retry_wait`, `rejected`) and no locally persisted success state. The prototype was deleted after this verdict was captured.

## Definition of ready

Implementation may start only when #51 adopts the shared Feedback Item identity/status contract or an implementation leaf explicitly delivers that prerequisite first. Each implementation leaf must name its owning layer, migrations/contracts, exact privacy and performance tests, and dependency order. No unresolved consent, visibility, retention, redaction, outbox, idempotency, or GitHub-integration decision remains in #154.
