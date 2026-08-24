# Issue #232 scheduler dictionary-access evidence

## Result

The production-shaped fixture contains exactly 18,184 entries with non-null
dictionary IDs. It uses five entry-bearing dictionaries: system curated,
user-owned private, public, user-entitled private, and denied private. The
normal bootstrap registry also contains `nl-vandale`, so the set-based scheduler
checks six registered dictionaries per invocation.

The exact-base scheduler called `can_access_dictionary` once for every entry:
18,184 calls per invocation and 1,127,408 calls across 62 measured scheduler
invocations. Migration 126 materializes the readable dictionary set once and
joins entries to it. The same run then made six policy calls per invocation,
plus five explicit policy probes: 377 total. The scheduler still delegates all
owner, visibility/tier, entitlement-window, and permission semantics to the
canonical `can_access_dictionary` function.

The DB-gated characterization also covers a legacy null-dictionary row and
proves deterministic plan/selector cardinality, due-order, FSRS source, and
exclusion drain. Current writes reject new null-dictionary entries; the fixture
only protects the scheduler's explicit historical read behavior.

## Local measurements

| Revision | Surface | First | Warm p95 | Warm max | Policy calls / invocation |
| --- | --- | ---: | ---: | ---: | ---: |
| `3b0c1bb7` | session plan | 279.0 ms | 291.2 ms | 302.2 ms | 18,184 |
| `3b0c1bb7` | next card | 291.4 ms | 307.7 ms | 309.2 ms | 18,184 |
| migration 126 | session plan | 174.5 ms | 185.5 ms | 188.3 ms | 6 |
| migration 126 | next card | 199.4 ms | 192.3 ms | 195.8 ms | 6 |

The fixed budget is first at most 2,000 ms, warm p95 at most 1,000 ms, and max
at most 2,000 ms. Local first calls discard prepared plans but do not flush
Postgres shared buffers or the OS cache. This evidence explains and removes the
production-only multiplicative hotspot; bounded production cold/warm evidence
is still mandatory after reviewed integration.

## First rollout gate

Production currently runs the application from `3b0c1bb7`, while its scheduler
DB functions were restored to the exact pre-123 selectors, the plan RPC is
absent, and the history RPC from migration 124 remains. The first DB rollout
must treat migrations 123, 124, 125, and 126 as one ordered gate:

1. Verify the exact app commit, pre-123 selector fingerprints, absent plan RPC,
   present history RPC, migration runner target, and isolated
   `test@2000nl.test` identity.
2. Apply 123 → 124 → 125 → 126 without advertising DB compatibility or running
   authenticated Training QA between migrations. A failure before 126 is a
   failed rollout, never a partially accepted scheduler state.
3. Probe the plan/selector signatures and grants, the pointer-only index plan,
   and the migration-126 readable-dictionary materialization before allowing
   the deployment gate to advertise compatibility.
4. Run bounded read-only plan/selector cold and 30-sample warm checks. Require
   first ≤2 s, warm p95 ≤1 s, and max ≤2 s, then smoke only with
   `test@2000nl.test` and revoke the QA session.

Recovery follows `docs/runbooks/nuc-db-contract-deploy.md`. A migration failure
inside its transaction rolls back automatically and is retried with the same
immutable contract. A failure after the app switch restores the previous app
image while committed forward DB migrations remain in place. Do not manually
replace functions behind ledger state 126.

If #232 approves an explicit DB rollback after a committed probe or budget
failure, its reviewed SQL must atomically restore the captured exact pre-123
`get_next_card` and `get_next_filtered_card` definitions, drop
`get_training_session_plan(uuid,text[],uuid,text,text,jsonb)`, preserve the
migration-124 history RPC, and reconcile the 123–126 ledger/state so the next
gate does not treat reverted functions as compatible no-ops. Re-run the prior
selector budget and app fallback smoke before declaring that explicit rollback
complete. Learning and history data are not reverse-migrated.

Issue #233 owns the generic deployment/migration gate. This branch rebases on
that integrated gate and advances the commit-owned contract to migration 126.
A fresh bootstrap, all FSRS/RPC tests, the exact ledger/postflight gate, and
this benchmark must pass on the final commit. The first enabled deployment
therefore applies or verifies 123–126 together; 123–125 cannot be accepted
alone.
