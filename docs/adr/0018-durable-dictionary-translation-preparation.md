# ADR-0018: Durable dictionary translation preparation

Date: 2026-10-11. Status: released in #676; client readiness remediation accepted 2026-10-13, tracked in #674.
Source: [owner discussion](../discussions/2026-10-11-05-reliable-translation-preparation.md).

Rollout order updated by the [owner follow-up](../discussions/2026-10-11-06-translation-rollout-order.md): retain full-context generation, ship pending/recovery, worker health and the bounded buffer first. Semantic partitioning and durable partial results are deferred, because the longest tested production cards now translate successfully with the released prompt and budgets. They remain possible follow-up architecture, not a prerequisite for this rollout.

## Context

The current HTTP coordinator owns provider execution. A cache row marked pending deduplicates requests but cannot restart abandoned work. Proxy, browser and provider deadlines differ. A headword artifact is insufficient evidence that a frozen training example is translated. Existing next-member prefetch behavior varies between training families.

## Decision

Postgres owns durable shared dictionary translation job identity and execution ownership. Identity includes entry, language, provider, exact source fingerprint/revision, translation policy and provider prompt revision. Authenticated route facades retain dictionary/capability authorization; clients have no direct queue table/RPC privileges. Lookup remains read-only. Private draft translations are outside this shared queue.

An independent worker in the application release image claims a job using a short transaction, performs provider work outside transactions, renews a fenced lease and atomically publishes the ready cache with job completion. Expired leases recover automatically; retries are bounded, delayed and never reset by observation. Foreground preparation can promote a queued job's priority. A newer identity supersedes active old work. Publication requires the exact live lease. Multiple worker processes share a fixed concurrency ceiling.

Readiness examines actual required field values, independent of claimed metadata. Selected-card readiness and whole-source completeness are separate contracts; bounded-request completeness alone does not prove source completeness. Complex articles require source inventory, semantic partitioning with context, persisted partial results and aggregate validation. Browser preparation uses only latched members, preserves frozen examples/progress and observes work independently of the browser connection lifetime.

The [2026-10-13 remediation](../discussions/2026-10-13-02-translation-remediation-release.md)
makes requested-field coverage part of read-only repair eligibility. A ready
headword alone cannot suppress preparation. A Library initialGroup or training
prefetch is only a display seed and is revalidated against the server on opening
the card. Word-context readiness refreshes the direction-specific training
projection; it must not copy Library review capabilities into reverse training.
Successful preparation invalidates browser copies of the same entry/language.
Visible cards and frozen future members retain the existing queue authority.

## Consequences and rollout

The worker, HTTP facade, polling/recovery and release health must be integrated before enabling queue execution. An additive queue migration alone does not change production behavior. Legacy synchronous writers must not overlap enabled queue writers for the same slot without a coordinated transition. Local real-Postgres concurrency/fencing tests precede manifest enablement. The release manifest requires exact checksum/postflight and worker-compatible rollback. #655 owns linguistic quality and #474/Free 100 own capability policy.

The first queue contract uses two concurrent leases globally, 60-second renewable leases and at most three automatic attempts with delayed retries. Explicit retries after failure have a one-minute cooldown; polling never restarts exhausted work. These are operational defaults to validate and measure, not product subscription quotas.

## Full source and tab synchronization — accepted 2026-10-13

[Owner acceptance](../discussions/2026-10-13-03-full-translation-and-tab-sync.md) promotes the deferred full-source inventory/partition stage. Readiness uses the full canonical inventory, including later legacy meanings. Provider parts are bounded and deterministic, with read-only semantic context and long-field segments. Each successful part is persisted under source/lease fencing. A successful continuation yields its global slot and does not consume a failure retry. Final ready publication remains the existing atomic RPC after aggregate value-based coverage. Partial results never become a ready cache. Pipeline v4 separates these artifacts from v3 bounded-request results; prompt v11 remains unchanged.

Cross-tab events carry only entry/language and an event identifier; they are invalidation hints. BroadcastChannel plus deduplicated storage fallback avoids echo. Visible surfaces revalidate at focus/visibility and every60s; pending context/sentence surfaces recover after their fast observation window. The server response determines source/policy freshness. Offline, provider failure or continuous source edits cannot guarantee immediate completion; they must not publish incomplete ready. Background reads preserve frozen membership and review direction.

Contract224 is additive and private. The emergency coordinated full-source switch can restore v3 behavior in the current224 image; it intentionally gives up the new completeness semantics. An old223 image is not a healthy rollback for224. The normal default remains full source.
