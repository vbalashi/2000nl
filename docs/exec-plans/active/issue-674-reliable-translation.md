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

Integration is deliberately pending: this draft migration is included in local/fresh bootstrap for canonical schema coverage, but not in the production deployment manifest; no worker service or queue-based HTTP behavior is enabled. The next integrated slice must connect authenticated enqueue/status, trusted source/provider identity resolution, independent worker startup/health and unified polling before queue rollout. Source inventory/semantic partitions/checkpoints and the bounded session buffer remain required scope, not completed by requested-field readiness.

## Server integration checkpoint — 2026-10-11 (in progress)

The default-off `DICTIONARY_TRANSLATION_JOBS_ENABLED` facade now separates authenticated enqueue/status from execution. It computes trusted identity, reuses complete cache artifacts, promotes foreground jobs and supports read-only observation without invoking the model. The synchronous path remains the default. Enqueue/status has a 15s operation deadline; worker REST calls have a separate 10s deadline, while generation retains its own provider/operation budgets.

A standalone worker is bundled into the immutable UI image. It claims identity-only jobs, reconstructs the trusted source, verifies provider/policy/content identity before and after generation, renews leases and shuts down after draining an active job. A real child-process test kills one worker during generation and verifies that its replacement publishes with the replacement token; actual Postgres tests separately establish lease recovery and fencing.

Migration 223 additionally hashes the canonical source row server-side and verifies it while holding the source lock during atomic publication. A source edit therefore prevents stale publication even without a competing enqueue. Ready-cache repair compares the observed cache timestamp, preventing an older request from invalidating a newly completed artifact. Disposable Postgres validation: 41 files / 367 tests pass. Worker/facade focused validation: 18 tests pass; typecheck passes.

The browser transport now retains cancellation/deadlines through response-body reading and carries explicit observation/background intent. Library and training media use a shared durable-job observation loop: read-only polls, no repeated force reset, source invalidation enqueue, bounded waiting that preserves pending, and abort without server cancellation. Background calls enqueue once. Five observation regressions and 87 Library/training/transport tests pass. Per-family pending presentation/recovery and background caller intent are still pending; the media facade must propagate terminal/pending state explicitly before enabling jobs. Worker health, Compose/deploy/rollback, full-source partitions, partial readiness, session buffering and browser QA remain required. Migration 223 is still absent from the production manifest, and the feature remains disabled in production.

Full UI regression after this integration: 262 files / 2,290 tests passed; 38 files / 355 DB-dependent tests skipped without DB URL. Typecheck passes. Lint passes with the same existing unrelated hook warning. Draft PR #675 contains the checkpoint; production and reference main are unchanged.

## Validation and rollout

Use local disposable Supabase/Postgres for migration iteration. Explicitly revoke public/authenticated queue table and function access; authenticated routes validate user access before service-role enqueue. Test deduplication under concurrent enqueue, exclusive claims, expired leases, late writes, failure exhaustion, source changes, provider partitions, browser disconnects and status polling. Training tests pin frozen membership and unchanged progress. Production DB deployment follows the exact-checksum/postflight manifest with no hold bypass. The worker must start with the matching immutable release and expose freshness/health; rollback must not strand or corrupt jobs. No bulk production regeneration.

## Risks to resolve

Queue fairness and cost admission; old pending cache ownership during transition; source/policy changes while a job runs; delayed old provider writes; stable partition identity and context budget; actual deployed worker lifecycle and rollback; product capability coordination. Defaults and failure behavior must be explicit and tested before enabling the worker.

CI initially caught the missing bootstrap include; it is now present without enabling production migration 223. The release-boundary declaration describes independent deployment of the cache-readiness foundation only; the PR remains draft and #674 remains in progress.

Further boundary regression: at the current maximum 128 content fields, translatedPaths contains 129 entries including headword. The safety filter previously dropped all coverage metadata at this boundary. It now preserves the legitimate 129 paths and still rejects oversized metadata; an artifact integration regression covers this case.

GitHub UI tests themselves passed; the subsequent standalone QA-wrapper suite caught four legacy fixtures that treated an unauthenticated Today label as success. Those fixtures now include an authenticated shell/session, and a new negative test preserves the auth gate. The complete standalone wrapper suite passes locally: 19/19. GitHub DB drift/bootstrap and FSRS passed on 9923f08d.
