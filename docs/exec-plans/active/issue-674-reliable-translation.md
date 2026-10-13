# #674 Reliable translation preparation

Owner: https://github.com/vbalashi/2000nl/issues/674
Accepted discussion: [2026-10-11](../../discussions/2026-10-11-05-reliable-translation-preparation.md).
Status: owner-prioritized queue/recovery/buffer stage released and verified. Production: d253a831, app 0.18.1282, DB contract 223. Semantic partitioning and expanded evaluation remain deferred.

## Updated rollout scope — 2026-10-11

[Owner decision](../../discussions/2026-10-11-06-translation-rollout-order.md): the longest tested cards now translate successfully with the released prompt and budgets. Prioritize pending/recovery → worker lifecycle/health → latched-member buffer → end-to-end verification. Semantic partitioning and persisted partial results are deferred follow-up, not a release prerequisite. Preserve full-context generation and current budgets.

## Baseline behavior and problem

Dictionary translation HTTP routes synchronously invoke the provider. A fresh pending cache row suppresses duplicate work for 300s but is not a durable executable job. Some training families prepare one next member, with different polling/retry behavior. Selected-field budgets do not prove whole-source completeness. Cloudflare may terminate the browser request before the provider finishes.

## Owning boundaries

Server domain service in apps/ui/lib/translation; queue and atomic lease RPCs in db/migrations; standalone worker in the same immutable application image on NUC; authenticated route facades retain access checks. Browser owns observation and bounded preparation requests, never job execution. No scheduler/progress/source identity changes. #655 owns linguistic evaluation; #474/Free 100 own product capabilities.

## Delivery checkpoints

- [x] Create owning issue, isolated checkout, accepted discussion and execution plan.
- [x] Characterize coordinator/API/cache contracts and strengthen actual requested-field readiness. Whole-source coverage remains deferred and distinct.
- [x] Durable identity-only jobs, atomic deduplication/claim/heartbeat/finish, bounded retries/backoff and lease fencing; real Postgres tests including restart and concurrency.
- [x] Separate execution from HTTP enqueue/status; standalone worker and coordinated deployment/health/rollback; preserve cache and connected-client contracts.
- [ ] Deferred follow-up: semantic partition fallback, durable partial successes and whole-source aggregate completeness. Current rollout preserves full-context generation and exact source/policy/provider freshness.
- [x] Shared polling/recovery across ordinary, word-context, sentence, idiom and Library; disconnect must not cancel server work.
- [x] Controlled latched-member buffer, current-card priority, bounded concurrency and pace-aware depth; no selection or learning mutations.
- [ ] Safe timings/coverage metrics, repeatable quality fixtures, stale production-QA probe repair.
- [x] Focused tests/typecheck/lint, DB contracts, worker-process restart checks, local browser QA, code review and review-ready PR.
- [x] Approved rollout, production release checks and reference sync. Checkout retirement follows preservation of local evidence.

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

## Pending, worker lifecycle and buffer checkpoint — 2026-10-11

The owner-requested rollout order is implemented locally. Training media propagates ready/pending/failed explicitly. Ordinary and idiom cards show pending without claiming an error; sentence sessions automatically recheck the same latched member and never mark a pending translation unavailable. Explicit retries may request a failed-job retry once; observation does not repeat force. The legacy translation hook also uses shared observation, cancels on card changes and ignores late results. Existing prompt and provider budgets are unchanged.

The worker has two bounded execution slots and the DB retains a global two-lease cap. Only one background lease may run, reserving capacity for foreground work. Compose uses the same immutable image, drains on SIGTERM, waits for health before switching UI, and restores compatible worker/UI state on rollback. Health requires a fresh successful queue/lease RPC signal from the same image commit, not just a running process. See [worker runbook](../../runbooks/dictionary-translation-worker.md).

The shared buffer covers ordinary, word-context, sentence and idiom sessions using only canonical latched membership. It deduplicates entries, enqueues sequentially, stops observation on scope changes and caps lead at three. Depth uses observed durable preparation duration and card pace; without durable timing evidence the synchronous fallback stays at one future member. No selection/grade/consumption/unavailable mutation is issued by the buffer.

Validation: full UI regression 264 files / 2,297 tests passed (DB-dependent tests skipped without URL); subsequent legacy-observation regression and focused transport/buffer checks passed. Disposable Postgres 41 files / 368 tests passed, including background-slot reservation. Typecheck and lint pass with the existing unrelated handlePlayAudio warning. Four operational script tests pass, including enabled/disabled Compose startup without secret logging; YAML parses. The Docker image builds, and the bundled worker runs healthy in that image against local Supabase.

Local browser QA used the dev login, real local Postgres/REST queue and separate worker, with a delayed synthetic provider: Library pending → ready succeeded, leaving Library while a job was queued did not cancel it, worker restart completed it and the translated text appeared on return. A stale worker heartbeat correctly changed deep health to warning. Synthetic translations do not measure linguistic quality. Local test services were stopped afterward; no production writes or paid model calls were made. Migration 223 is applied only to the local test DB and remains absent from the production manifest. PR #675 stays draft pending CI/review and the exact deployment contract/activation checkpoint.

Checkpoint preservation: the earlier Git write restriction was removed by the owner. The validated follow-up is being committed and pushed to draft PR #675; the worktree remains active for CI/review and deployment-contract preparation. Production activation is still pending.

## Validation and rollout

Use local disposable Supabase/Postgres for migration iteration. Explicitly revoke public/authenticated queue table and function access; authenticated routes validate user access before service-role enqueue. Test deduplication under concurrent enqueue, exclusive claims, expired leases, late writes, failure exhaustion, source changes, provider partitions, browser disconnects and status polling. Training tests pin frozen membership and unchanged progress. Production DB deployment follows the exact-checksum/postflight manifest with no hold bypass. The worker must start with the matching immutable release and expose freshness/health; rollback must not strand or corrupt jobs. No bulk production regeneration.

## Risks to resolve

Queue fairness and cost admission; old pending cache ownership during transition; source/policy changes while a job runs; delayed old provider writes; stable partition identity and context budget; actual deployed worker lifecycle and rollback; product capability coordination. Defaults and failure behavior must be explicit and tested before enabling the worker.

CI initially caught the missing bootstrap include; it is now present without enabling production migration 223. The release-boundary declaration describes independent deployment with durable jobs disabled and the production DB contract unchanged; the PR remains draft and #674 remains in progress.

Further boundary regression: at the current maximum 128 content fields, translatedPaths contains 129 entries including headword. The safety filter previously dropped all coverage metadata at this boundary. It now preserves the legitimate 129 paths and still rejects oversized metadata; an artifact integration regression covers this case.

GitHub UI tests themselves passed; the subsequent standalone QA-wrapper suite caught four legacy fixtures that treated an unauthenticated Today label as success. Those fixtures now include an authenticated shell/session, and a new negative test preserves the auth gate. The complete standalone wrapper suite passes locally: 19/19. GitHub DB drift/bootstrap and FSRS passed on 9923f08d.

## Release review — 2026-10-11

Owner authorized production release. Standards/security/operational review found no blocking issue in bea5f621. Spec review identified pending source invalidation without a matching job: observation now re-enqueues needsEnqueue without force; six focused tests pass. CI's startup E2E assumed no translation request after Start; updated it to assert exactly the next frozen entry at background priority without force. Original scenario failed locally before the change and passes afterward. Production migration/activation remains separate from the default-off PR release.

## Activation follow-up — 2026-10-11

PR #675 merged at 2d256472 and deploy 38156313155 succeeded. Production 0.18.1281 reported that exact commit, compatible DB contract 222, deep health ok and translationWorker.enabled=false. Reference main synchronized. The same clean issue checkout was reused on codex/674-activate-translation; the merged feature branch remains preserved.

Activation adds migration 223 with exact checksum, chained read-only postflight (privacy/grants, identity/lease constraints, bounded claims and publication fences) and production deploy flag. Postflight passes locally; probe-only negative tests reject missing worker UPDATE privilege and missing function search_path. Independent review found no activation blocker. Prompt/provider budgets remain unchanged. CI and production activation verification are pending.

## Verified production activation — 2026-10-11

PR #676 merged at d253a8316f54cdbfeade900a959618a847859ccf; NUC deploy 38158573215 succeeded. Production 0.18.1282 reports that exact commit, compatible contract 223, deep health ok and translationWorker.enabled=true. UI and healthy worker use the same immutable image. Reference main synchronized to the deployment commit.

One bounded production smoke enqueued the trusted NT2 bank entry at foreground priority without force, keeping prompt/model/budgets unchanged. Job 2da2f106-9eda-480f-a5ad-c18117573950 transitioned queued → running → ready on attempt 1 in about 4.3s. Readback confirmed ready cache, all job/cache identity fields matching and four translated coverage paths. No learner scheduling/progress was changed and no bulk regeneration occurred. Production restart/failure injection was not performed; those recovery cases are covered by local process/Postgres/browser tests.

Latest activation CI: 2,299 unit tests pass, DB drift/security/guidance/release boundary pass; browser suites 217 + 29 + 17 pass, with one retried flaky case. Local contract gate 19 tests and operational scripts four tests pass; full read-only local postflight and isolated negative checks pass. CI caught stale guidance range and coordination-issue fixture; both were corrected before merge.

Remaining scope: semantic fallback/persisted partial results and whole-source aggregate completeness are explicitly deferred. Expanded coverage/quality metrics and product cost admission remain separate follow-up; this release does not claim every possible provider/source failure is eliminated. Evidence and retirement handoff: /Users/khrustal/adhoc/2000nl-research-archives/674-release-2026-10-11/. Branch refs for #675/#676 are retained; temporary QA artifacts are preserved before removing the completed checkout.

## Full-source follow-up completed — 2026-10-13

The deferred persisted semantic parts and whole-source coverage stage shipped in PR #687 (0.18.1286, f670d6b7, contract224). Cross-tab recovery shipped in the same release. See [verified complete plan](../completed/issue-674-full-translation-and-tab-sync.md); production hand64/64 ready on attempt1, oversized/resume fixtures verified locally. Expanded quality/cost observability remains separate from this structural readiness guarantee.
