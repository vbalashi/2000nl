# Bounded diagnostic reports feed the feedback queue

Status: proposed; acceptance is gated by #51 adopting the shared Feedback Item
model.

Date: 2026-08-13

Related: #51, #154; [full contract](../architecture/diagnostic-report-contract.md)

## Context

Learners need to report card, translation, rendering, loading, and Training
action failures even when connectivity is interrupted. General log bundles are
too broad for a learning product, while a GitHub issue is neither a safe raw
diagnostic store nor an offline delivery protocol.

## Decision

Diagnostic Reports create durable Feedback Items in the shared #51 review queue, while their full Diagnostic Envelopes are separate, allowlist-built evidence retained for only 90 days. Reports are frozen under one UUID before entering a 30-day local outbox, and transport retries reuse that identity; this keeps offline delivery reliable without turning GitHub, browser logs, arbitrary URLs, credentials, or unrelated browser state into automatically collected diagnostic storage.

The learner sees only transient delivery status. Internal admin reviewers decide whether a Feedback Item warrants a manually written GitHub issue, and accepted reports are removed from the local outbox immediately. This boundary deliberately favors bounded, classifiable evidence over general-purpose debugging capture so forbidden data is impossible to collect and diagnostics cannot grow into a performance-sensitive surveillance channel.

The only free-form field is the explicitly classified learner comment. It is
warned, bounded, access-controlled, retained only with the 90-day envelope, and
never copied automatically into the durable queue or GitHub. A durable summary,
if needed, is separately authored and sanitized by an admin reviewer.

## Consequences

- Client and server must share one exact closed schema and canonical hashing
  algorithm.
- Offline records require IndexedDB lease/retry handling but contain no auth
  token.
- Feedback remains searchable after detailed evidence expires, without keeping
  raw learner prose or card content indefinitely.
- Rejected immutable payloads are terminal; a later Report action creates a
  new identity under the current schema.
- Production implementation cannot begin until #51 accepts the shared durable
  fields and review states described by the full contract.
