# 2000NL platform engineering principles

Date: 2026-06-23

These principles are the baseline for future agents working on Platform API, dictionary lookup, card actions, source provenance, learning state, and external clients.

## 1. 2000NL owns learning semantics

2000NL is the authority for:

- dictionary entry identity;
- card type IDs;
- action IDs;
- review result IDs;
- FSRS and current card state;
- source normalization and privacy policy;
- immutable source-linked action history;
- user-scoped learning read models.

External clients may observe context and request explicit actions. They must not invent or simulate learning state.

## 2. Lookup is read-only

Lookup, selection analysis, dictionary overlay rendering, and phrase/text translation must not mutate learning state.

Mutations happen only through explicit Platform actions. Do not add hidden `record-view`, `start-learning`, or review behavior to lookup paths.

## 3. Mutations need a single authoritative path

Card-state changes must continue through one explicit action boundary.

For source-aware card actions, the mutation and provenance event must be atomic. Never record a successful source event if the underlying card mutation did not happen or was rejected.

## 4. Current state and history are different models

`user_card_status` / FSRS state is the current scheduling state. `user_card_action_events` and source tables are immutable history.

Do not denormalize a single `source_id` onto current card state as a shortcut. One card can be encountered from many sources.

## 5. Principal identity is server-derived

Trusted client identity comes from authenticated server-side state, not request JSON, CORS origin, frontend labels, or body fields.

Connected-client routes must enforce scopes at the Platform boundary:

- read endpoints require `platform:read`;
- write endpoints require `platform:write`;
- `offline_access` only allows refresh behavior and does not imply read/write access.

## 6. Source context has semantic layers

Do not collapse source provenance into one JSON blob.

Keep these separate:

- canonical source: the external resource;
- artifact: the concrete text/timing/phrase/document revision;
- location: where inside that artifact the action happened;
- selection: the learner's clicked or selected unit;
- observation: title, playback time, URL seen by the client, capture time;
- diagnostics: retrieval path, warnings, debug flags.

Only canonical semantic fields should affect durable identity and idempotency.

## 7. Idempotency is semantic and stable

One intentional action has one UUID `clientEventId`. Transport retries reuse the same id and canonical payload.

Do not include volatile observation or diagnostics in idempotency. Playback time, page title, retry timestamp, warning arrays, or temporary retrieval attempts must not turn a valid retry into a conflict.

A second intentional user action is a new event and gets a new id.

## 8. Privacy is part of source identity

Public canonical sources, such as YouTube videos, may be globally deduplicated when server-normalized.

Private web pages, text documents, and ebooks must be user-scoped unless a trusted server-side catalog proves a public identity.

Default behavior for private sources:

- minimize raw context;
- strip credentials, fragments, and tracking parameters from URLs;
- avoid storing full page/document content;
- prefer hashes and bounded snippets;
- never let one user's title or URL observation overwrite another user's canonical source row.

## 9. Keep raw provider payloads below stable contracts

Clients should consume documented Platform response shapes. Avoid adding behavior that parses `entry.raw` unless the contract explicitly says that field is the source of truth.

If UI needs a new display field, add it to the documented projection rather than teaching a client to infer it from provider internals.

## 10. Prefer characterization before refactor

When a module is broad but working, do not split it blindly. First add characterization tests for:

- request parsing;
- response shapes;
- error codes;
- mutation side effects;
- DB/RPC behavior;
- privacy/redaction behavior.

Then split by domain.

## 11. Do not broaden scope accidentally

Do not combine these into one change:

- provenance storage changes;
- FSRS algorithm changes;
- UI redesign;
- dictionary provider cleanup;
- external-client auth changes;
- Pontix web-source implementation.

Each area needs its own tests and acceptance criteria.

## 12. Validation requirements

For Platform/provenance changes, run or require evidence for:

- route tests for Platform actions and learning read APIs;
- DB/RPC tests for FSRS/provenance behavior;
- typecheck and lint;
- docs updates when public contracts change.

A change that only passes mocked route tests is not enough when DB trust boundaries or provenance semantics changed.

## 13. Recommended decomposition path

If decomposing `apps/ui/lib/platform/platformApi.ts`, split along stable domain boundaries:

- lookup service;
- action service;
- source-context normalizer;
- provenance mapper;
- translation service;
- list service;
- user dictionary service;
- response projection helpers.

Keep the public route contracts stable while doing this.