# #674 Reliable translation preparation

Owner: https://github.com/vbalashi/2000nl/issues/674
Accepted discussion: [2026-10-11](../../discussions/2026-10-11-05-reliable-translation-preparation.md).
Status: implementation started; not released. Baseline: main 9c0335a9, app 0.18.1280, DB contract 222.

## Current behavior and problem

Dictionary translation HTTP routes synchronously invoke the provider. A fresh pending cache row suppresses duplicate work for 300s but is not a durable executable job. Some training families prepare one next member, with different polling/retry behavior. Selected-field budgets do not prove whole-source completeness. Cloudflare may terminate the browser request before the provider finishes.

## Owning boundaries

Server domain service in apps/ui/lib/translation; queue and atomic lease RPCs in db/migrations; standalone worker in the same immutable application image on NUC; authenticated route facades retain access checks. Browser owns observation and bounded preparation requests, never job execution. No scheduler/progress/source identity changes. #655 owns linguistic evaluation; #474/Free 100 own product capabilities.

## Delivery checkpoints

- [x] Create owning issue, isolated checkout, accepted discussion and execution plan.
- [ ] Characterize current coordinator/API/cache contracts and strengthen selected-card/full-source readiness.
- [ ] Durable identity-only jobs, atomic deduplication/claim/heartbeat/finish, bounded retries/backoff and lease fencing; real Postgres tests including restart and concurrency.
- [ ] Separate execution from HTTP enqueue/status; standalone worker and coordinated deployment/health/rollback; preserve cache and connected-client contracts.
- [ ] Full-context first, semantic partition fallback, durable partial successes, aggregate completeness and exact source/policy/provider freshness.
- [ ] Shared polling/recovery across ordinary, word-context, sentence, idiom and Library; disconnect must not cancel server work.
- [ ] Controlled latched-member buffer, current-card priority, bounded concurrency and pace-aware depth; no selection or learning mutations.
- [ ] Safe timings/coverage metrics, repeatable quality fixtures, stale production-QA probe repair.
- [ ] Focused tests/typecheck/lint, DB contracts, worker-process restart checks, local browser QA, code review and review-ready PR.
- [ ] Approved rollout, production release checks, reference sync and safe retirement.

Each integrated slice must identify remaining checkpoints; completing the first slice does not complete #674.

## Foundation checkpoint — 2026-10-11

Implemented locally, not released:

- Actual-value readiness helper distinguishes selected-card readiness and requested-field completeness. The synchronous coordinator now repairs incomplete matching cache artifacts and rejects incomplete provider artifacts before ready publication. Complete idiom-only artifacts remain cacheable without a fabricated headword.
- Additive migration 223 defines service-role-only job identity, deduplication, foreground priority promotion, global two-lease concurrency, 60s heartbeat leases, three delayed attempts, failure cooldown and source-revision supersession. Completion publishes cache and job status atomically under the live token. Expiry is checked after acquiring row locks, including lock-wait races.
- Worker execution primitive renews leases, bounds RPC waits, checks returned source/card identity and requested-field coverage, fences completion and records safe lifecycle timing. It is not yet a standalone running worker or connected to HTTP routes.
- Production QA surface probe recognizes the current ready overview after authentication; loading/error/hidden surfaces and unauthenticated retired labels do not pass.
- Real disposable Postgres tests cover duplicate/concurrent enqueue, exclusive/global claims, expired-worker recovery, late writes, attempt exhaustion, source changes, client-role privileges and expiry while waiting for locks. Unit tests cover heartbeat loss/hang, incomplete/wrong-source worker outputs, cache repair and probe states.

Validation at this checkpoint: UI typecheck passes; full UI suite 259 files / 2,272 tests passed (38 files / 353 DB-dependent tests skipped without DB URL); disposable Postgres suite 41 files / 365 tests passed, including nine queue contract tests. The additional idiom-only cache regression passed in the focused four-test coordinator suite. Lint passes with the existing unrelated handlePlayAudio dependency warning in TrainingSenseCardV2Session.tsx:617. No production mutation, worker-process deployment or browser release verification has been performed.

Integration is deliberately pending: this draft migration is not in the deployment manifest/bootstrap; no worker service or queue-based HTTP behavior is enabled. The next integrated slice must connect authenticated enqueue/status, trusted source/provider identity resolution, independent worker startup/health and unified polling before queue rollout. Source inventory/semantic partitions/checkpoints and the bounded session buffer remain required scope, not completed by requested-field readiness.

## Validation and rollout

Use local disposable Supabase/Postgres for migration iteration. Explicitly revoke public/authenticated queue table and function access; authenticated routes validate user access before service-role enqueue. Test deduplication under concurrent enqueue, exclusive claims, expired leases, late writes, failure exhaustion, source changes, provider partitions, browser disconnects and status polling. Training tests pin frozen membership and unchanged progress. Production DB deployment follows the exact-checksum/postflight manifest with no hold bypass. The worker must start with the matching immutable release and expose freshness/health; rollback must not strand or corrupt jobs. No bulk production regeneration.

## Risks to resolve

Queue fairness and cost admission; old pending cache ownership during transition; source/policy changes while a job runs; delayed old provider writes; stable partition identity and context budget; actual deployed worker lifecycle and rollback; product capability coordination. Defaults and failure behavior must be explicit and tested before enabling the worker.
