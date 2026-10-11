# ADR-0018: Durable dictionary translation preparation

Date: 2026-10-11. Status: accepted architecture; integration and rollout pending #674.
Source: [owner discussion](../discussions/2026-10-11-05-reliable-translation-preparation.md).

Rollout order updated by the [owner follow-up](../discussions/2026-10-11-06-translation-rollout-order.md): retain full-context generation, ship pending/recovery, worker health and the bounded buffer first. Semantic partitioning and durable partial results are deferred, because the longest tested production cards now translate successfully with the released prompt and budgets. They remain possible follow-up architecture, not a prerequisite for this rollout.

## Context

The current HTTP coordinator owns provider execution. A cache row marked pending deduplicates requests but cannot restart abandoned work. Proxy, browser and provider deadlines differ. A headword artifact is insufficient evidence that a frozen training example is translated. Existing next-member prefetch behavior varies between training families.

## Decision

Postgres owns durable shared dictionary translation job identity and execution ownership. Identity includes entry, language, provider, exact source fingerprint/revision, translation policy and provider prompt revision. Authenticated route facades retain dictionary/capability authorization; clients have no direct queue table/RPC privileges. Lookup remains read-only. Private draft translations are outside this shared queue.

An independent worker in the application release image claims a job using a short transaction, performs provider work outside transactions, renews a fenced lease and atomically publishes the ready cache with job completion. Expired leases recover automatically; retries are bounded, delayed and never reset by observation. Foreground preparation can promote a queued job's priority. A newer identity supersedes active old work. Publication requires the exact live lease. Multiple worker processes share a fixed concurrency ceiling.

Readiness examines actual required field values, independent of claimed metadata. Selected-card readiness and whole-source completeness are separate contracts; bounded-request completeness alone does not prove source completeness. Complex articles require source inventory, semantic partitioning with context, persisted partial results and aggregate validation. Browser preparation uses only latched members, preserves frozen examples/progress and observes work independently of the browser connection lifetime.

## Consequences and rollout

The worker, HTTP facade, polling/recovery and release health must be integrated before enabling queue execution. An additive queue migration alone does not change production behavior. Legacy synchronous writers must not overlap enabled queue writers for the same slot without a coordinated transition. Local real-Postgres concurrency/fencing tests precede manifest enablement. The release manifest requires exact checksum/postflight and worker-compatible rollback. #655 owns linguistic quality and #474/Free 100 own capability policy.

The first queue contract uses two concurrent leases globally, 60-second renewable leases and at most three automatic attempts with delayed retries. Explicit retries after failure have a one-minute cooldown; polling never restarts exhausted work. These are operational defaults to validate and measure, not product subscription quotas.
