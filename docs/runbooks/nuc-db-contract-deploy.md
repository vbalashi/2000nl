# NUC database contract deployment

The NUC deploy is fail-closed: a checked-out application commit declares one
exact database contract in
`packages/shared/deployment/db-contract.json`. The deploy builds an immutable
image first, applies only the manifest's contiguous reviewed-forward migrations,
runs exact SQL probes, switches the container, and then accepts the release only
when deep health reports the same commit and database contract.

When a forward migration replaces an existing function, start from the **last
committed migration that defines that exact signature**, not the first search
hit or original introduction. Check the deployed `app_db_contract_state` and,
when production is accessible, compare the current `pg_proc.prosrc` body with
that committed definition before editing. Review the new function against
that latest body so intervening filters, clocks, permissions, and queue rules
survive. Characterization tests and the migration postflight must pin those
preserved behaviors. This caught an uncommitted migration-159 draft copied
from migration 146 that would have dropped migration-157 lexical filtering
and reference-clock behavior; the shipped migration was rebuilt from 157.

The NUC host does not provide `psql` and must not be mutated to add it. The
workflow runs PostgreSQL client 17 from the official digest-pinned container in
`DB_PSQL_IMAGE`. Before the expensive app build it starts that image with no
network and runs only `psql --version`. A missing Docker runtime, unavailable
image, non-zero client, or wrong client major therefore stops deployment before
`.env` is read or any database connection is possible. The apply command repeats
that preflight and then reuses the already-pulled exact image.

## Current coordinated rollout

Issue #233 first integrated the gate with `rollout.status: hold` and
`requiredMigrationId: 126`. That held deployment stopped before Docker build,
database connection, migration, or container switch. The contract was first
enabled after #232 appended migration 126 with its exact SHA-256. Issue #238
advances it to migration 127 after the bounded pre-switch read exposed
repeatable cold session-plan I/O even after migration 126. Issue #243 advances
it to migration 128 after the now-fast plan exposed the remaining cold
authoritative next-card selector.

Issue #265 advances it to migration 129 for additive app-local reading-size
storage on `user_settings`. Issue #278 advances it to migration 130 for the
observable Learn/enrollment and graded-history projections. Issue #279 advances
it to migration 131 for the pinned FSRS same-day short-term parity correction.

Issue #334 advances the contract to migration 139. It gives sessions a
server-owned action budget and soft new/review mixing without applying daily
scheduler caps.

Issue #353 advances the contract to migration 140. It makes the parameterized
candidate selector the one authoritative implementation; compatible direct
selector adapters preserve daily-cap and explicit-practice policy without
duplicating the candidate query.

Issue #355 advances the contract to migration 141. It restores only the public
pre-practice-aware scheduler overloads as v2-backed adapters, so a browser
holding a previous JS bundle cannot fail while the database has already moved
forward. Private v1 candidate functions and older bypass RPCs remain retired.

Issue #330 advances the contract to migration 142. It excludes only later
ordinary direct-recall directions lacking an owned root example before session
membership is latched. The content-derived exclusion is reversible and uses
the existing unavailable/replacement path for an older latched member.

Issue #329 advances the contract to migration 143. It introduces source-bound
ordinary meanings headword-first, unlocks later renderable meanings at the next
local midnight after Learn/Known, and preserves all existing learner progress.

Issue #358 advances the contract to migration 144. It removes the unreachable
count-only planning helper after the public plan had already moved to the
canonical v2 candidate relation.

Issue #378 advanced the contract through migration 147. It attributes training
counters to the learner's local 04:00 study day using an IANA timezone, while
preserving FSRS timestamps, finite-session budgets, and learner progress. The
scheduler diagnostics and fallback selector use the same local boundary and
do not enforce a daily quota.

The temporal evidence slice for #290 adds migration 148. It routes the
authoritative FSRS, selector, filter, and session-plan reads through one
private deterministic clock seam without changing public RPC signatures.

The follow-up #290 action/lifecycle slice adds migration 149. It routes session
creation/expiry, accepted action timestamps, consumed/completed member state,
and action history/receipt timestamps through the same private seam. It keeps
the public action signatures and scheduler policy unchanged.

The shared content-bound Training Exercise contract for #385 adds migration
151. It stores idiom and sentence-exercise targets, state, action receipts, and
session membership additively; ordinary card state and history remain on their
existing contracts, and no new exercise mode is enabled by the migration.

The first idiom runtime slice adds migration 152. It selects explained idiom
nodes for learners who already study or know an ordinary meaning, creates
direction-specific idiom targets, and records self-assessed FSRS actions in
additive exercise state. It excludes example-only/unexplained idioms, keeps
translation and ordinary-word scheduling unchanged, and exposes the new
boundary only through service-principal adapters until its application consumer
is enabled.

Migration 155 adds the application consumer for idiom exercises. It creates
idiom-family Training sessions in the existing one-active-run authority,
reuses the finite session size and soft new/review ordering, and consumes
idiom members atomically through the migration-154 action boundary. It keeps
ordinary Training responses unchanged and exposes no exercise-family launch UI;
that visual decision remains gated by #331.

Migration 156 adds the explicit per-session new/review rhythm for ordinary
Training under #407. The finite preview accepts `p_new_review_ratio` as its
eighth argument; the idempotent start accepts it as its ninth argument, after
`p_request_id`. Named calls use those exact names. Mixed sessions validate
integer values 1 through 5. New-only and review-only sessions normalize the
irrelevant ratio to 2, while `card_filter` controls their queue. The selected
ratio is included in the start receipt's request hash, stored on
`training_sessions`, and used if an unavailable member needs replacement.
The migration emits a PostgREST schema-cache reload notification at commit so
the new named RPC argument can be resolved without waiting for cache expiry.
Pre-existing sessions have a null latch and retain the historical global
preference fallback. The older public preview/start overloads remain callable
for prior app images and cached bundles; this migration does not enable an
exercise family or change ordinary FSRS state. App-image rollback can therefore
leave migration 156 in place.

Migration 157 applies supported Dutch part-of-speech and `de`/`het` filters in
the canonical scheduler scope before planning and session membership are
latched. No selected part of speech keeps the existing unfiltered pool,
including entries without POS metadata. An active POS filter excludes missing
or unsupported metadata. Article filters narrow selected noun candidates while
keeping explicitly selected non-noun categories; with no POS selection, an
article filter selects only matching nouns. Date/source activity filters keep
their existing history-matching meaning when combined with lexical filters.
Fixed expressions and idioms remain on the separately gated idiom exercise
path; this migration does not enable that family. The postflight verifies the
private helper boundary and selector routing, and the integration probe checks
empty results, missing POS, article matching, mixed POS/article selection,
unfiltered compatibility, and latched membership. The default unfiltered
read-probe remains unchanged; the new SQL scope still must pass its bounded
session-plan CI measurement before rollout.

Migration 160 adds all-accessible or explicitly selected dictionaries as
ordinary Training material. The selected language and dictionary IDs travel in
the session's existing `training_filter` JSON; no new public RPC signature or
FSRS state key is introduced. The scheduler intersects the requested set with
server-side dictionary read access before lexical and queue filters. A missing
explicit source can narrow the selection but never widen it; mixing a list ID
with a dictionary scope yields no candidates. Legacy list and default-NT2
selection remain on their prior branches. The postflight pins those boundaries,
the FSRS integration test checks private, partially revoked, wrong-language,
mixed-source and latched-session cases, and the wide-corpus latency fixture
checks legacy candidate parity after the function replacement. App rollback
can leave migration 160 in place because old clients omit `dictionaryScope`.

Migration 158 enables RLS on `user_training_scopes` and removes table-level and
column-level privileges from `PUBLIC`, `anon`, and `authenticated`. The
application has no direct table callers; authenticated reads and writes remain
available through `get_active_training_scope` and
`update_active_training_scope`, whose `SECURITY DEFINER` boundary verifies
`p_user_id` against `auth.uid()`. The migration deliberately creates no direct
table policy and does not force RLS, so the existing owner-run RPCs continue to
work. It changes no user rows and leaves service-role privileges untouched.
If the app health gate fails after this migration, restore the previous app
image through the normal deployment workflow and leave migration 158 in place;
the previous app already uses the same scoped RPCs. Do not reverse the grants
or disable RLS as an app rollback, because that would silently reopen the
exposure. If an app image cannot use the preserved RPC contract, stop the
rollout and repair that image before switching traffic.

Migration 153 adds one active first-party Training run per learner. It preserves
ordinary queue membership and durable FSRS/history, but makes a superseded
queue non-actionable before its next card can be projected or graded. It also
stores an idempotent start receipt so a lost start response does not create a
second run.

### Migration 153 action rollout

#### Phase 1 — rollback-compatible

Apply migration 153 before switching to the session-aware app. Current Training
uses the explicit 13-argument action RPC with a concrete `trainingSessionId`;
that path is fenced in the same transaction as the mutation. Current Library
uses its dedicated HTTP endpoint and the same RPC with an explicit null session.
Connected Client keeps its established 12-argument path and scopes.

The immediately previous app image and cached Library bundles both use the old
first-party 12-argument action shape. The previous app also has authenticated
legacy Learn/Known callers. These calls are byte-for-byte indistinguishable from
stale old Training, so phase 1 deliberately retains them. Do not infer intent
from whether an entry belongs to any queue: a legitimate Library action may
target an entry in an active or superseded queue.

The deployment manifest identifies this boundary as
`legacy-first-party-compatible` and pins issue #399 as its strict-enforcement
owner. The gate rejects unknown phases or a missing cutoff owner before database
access.

This is an explicit, temporary residual risk: stale old Training can still
write through the compatibility paths during phase 1. In exchange, automatic
app-image rollback and cached Library remain functional. Postflight and FSRS
tests pin this exact boundary so it cannot be mistaken for strict enforcement.

Deployment order:

1. Apply/verify contract 153 and its postflight while the previous app remains
   live.
2. Switch to the current app, then smoke current Training takeover rejection,
   current Library Learn/Known on a queued entry, and Connected Client actions.
3. If app health fails, restore the previous image without reversing migration
   153; its old first-party and exact legacy RPC shapes remain usable.
4. Keep phase 1 until the previous image is retired as a rollback target and the
   accepted cached-bundle window has elapsed or old bundles are invalidated.

#### Phase 2 — strict enforcement (#399)

Issue #399 owns the next immutable migration. It will reject the ambiguous
12-argument `first_party` action path and revoke authenticated legacy Learn/Known
RPC execution while leaving Connected Client unchanged. Enabling that migration
is the declaration that rollback to the pre-session-aware app is no longer
supported. Do not implement the cutoff as mutable operator SQL or edit migration
153 after deployment; advance the contract, checksum, postflight and rollback
runbook together.

Migration 159 narrows ordinary-meaning predecessor ordering to source groups
present in the requested Training scope while retaining out-of-scope siblings
within those groups. It preserves the lexical filters, reference clock, grants,
queue policy, and existing learner state. Its postflight checks the scoped
scheduler definition, and the exact pre-switch read runs before
the new app image is switched. A failed gate leaves the previous image live;
the forward migration remains installed for a corrected follow-up release.

An enabled deployment must apply or verify migrations 123 through 159 in order
before it advertises compatibility. The runner rejects an enabled manifest
whose last migration is below the required migration.

Migration 154 is additive exercise-boundary hardening on top of migration 153.
It canonicalizes retry identity, checks the receipt before mutable target and
session validation, consumes a latched exercise member atomically, and fails
closed after source or dictionary access is lost. It does not change ordinary
word progress, FSRS history, or the phase-1 compatibility policy owned by
issues #393 and #399.

Migration 155 is additive idiom-session consumption on top of migration 154.
It does not copy or delete existing FSRS/history, and it preserves attached
idioms as supporting ordinary-card content. Its migration owner is #332; the
launch and visual review remain in #331.

Migration 156 is additive ordinary-session rhythm storage. The postflight
checks the new column, constraint, exact old/new overloads and argument names,
security-definer search paths, role grants, request-hash routing, and
replacement latch. The pre-switch probe retains the existing bounded
read-only QA selector because the new ratio is an ordering parameter, not a
new selector read path. Before shipping the slider, run the migration-156 FSRS
tests against a disposable database and confirm the enabled manifest, exact
checksum, postflight, and app client are reviewed together. Do not replay
`bootstrap.sql` over the populated local QA database without a verified
deployment ledger.

## What the gate guarantees

- The baseline-122 read-only probe runs before the gate creates its ledger.
- The ledger itself is an immutable pre-managed migration declared with its
  own checksum in the manifest. It is separate from the numbered application
  sequence only because it must exist before migration 123 can be recorded;
  later ledger/state schema changes must use the numbered migration sequence.
- Migration filenames are contiguous and their bytes must match manifest
  SHA-256 values.
- One PostgreSQL advisory lock serializes the full gate.
- Each missing migration and its ledger/state record commit in the same
  transaction. A failed migration leaves neither its schema changes nor its
  ledger row.
- A database newer than the checked-out app, or a changed already-recorded
  migration, stops deployment.
- Postflight checks exact RPC signatures, role grants, and a deterministic
  `EXPLAIN (FORMAT JSON)` contract proving the default NT2 scheduler scope uses
  its narrow synchronized projection instead of wide dictionary rows. It pins
  materialized learner settings/status and readable-dictionary sets, the
  narrow default selector scope, the list selector branch, the selected-card
  sibling-count index, application compatibility, and the bounded health signal.
- Before compatibility is advertised, the gate executes the checksum-pinned
  session-plan and actual next-card selector as exactly one `test@2000nl.test`
  principal inside `BEGIN READ ONLY`. It discards only the deployment session's
  cached plans and cannot review, report, mark known, or otherwise mutate
  learner state. The SQL must succeed within a 10,000 ms safety timeout.
- The same read is measured against a 2,000 ms user-experience budget. A
  successful read above that budget emits `performance-warning` with elapsed,
  budget, and hard timeout values, then permits the app switch. This applies
  to scheduler migrations and no-op/UI-only releases alike: SQL success and
  postflight establish compatibility; a slow first read alone does not.
  Issue #413 remains open until the cold path is reliably fast.
- The pre-switch read runs on no-op retries too. This is deliberate: forward
  migrations commit independently, so a timed-out first read must not be
  bypassed merely because the retry sees those migrations in the ledger.
- The database URL is passed to `psql` through `PG*` environment variables,
  never command arguments. Gate output redacts URLs and credential-like values.
- Containerized `psql` receives only named `PG*` variables, runs read-only with
  all Linux capabilities dropped and `no-new-privileges`, and mounts no host
  files. TLS still defaults to `require`; the advisory lock, transactions,
  postflight, health contract, and app-image rollback are unchanged.

Inspect the commit-owned contract without database access:

```bash
node db/scripts/deploy_db_contract.mjs expected
node db/scripts/deploy_db_contract.mjs rollout-status
node db/scripts/deploy_db_contract.mjs validate
node db/scripts/deploy_db_contract.mjs client-preflight \
  --psql-container-image \
  postgres@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94
```

For a reviewed non-production database, run the same gate with an exact commit:

```bash
DEPLOY_APP_COMMIT="$(git rev-parse HEAD)" \
  node db/scripts/deploy_db_contract.mjs apply \
    --psql-container-image \
    postgres@sha256:ef257d85f76e48da1c64832459b59fcaba1a4dac97bf5d7450c77753542eee94 \
    --env-file .env.local
```

Never point this command at production outside the NUC deployment workflow.

## Deployment and stop conditions

The workflow keeps the current container running while it builds the new image.
It stops without switching the app when the manifest is held, the pinned client
preflight fails, the baseline is too old, the DB is newer than the app, a
checksum differs, a migration fails, or postflight fails. Client preflight also
runs before building. A missing/ambiguous QA identity, read-only violation, or
selector SQL failure or a 10,000 ms safety timeout also stops before the app
switch. A successful read over 2,000 ms is a logged performance warning. The old app
continues serving; rerunning the same immutable deployment repeats the read
probe even when every forward migration is now a no-op. After the container
switch, deep health must report:

- the exact 40-character deployed commit;
- overall `status: ok`;
- `checks.databaseContract.status: ok`;
- identical expected/actual contract IDs and migration IDs.

Health exposes only contract IDs, migration numbers, and compatibility. It does
not expose function definitions, grants, schema names, checksums, or credentials.
For an over-budget release, the deployment log retains the measured warning and
the post-switch deep-health receipt confirms that the exact app/DB contract
became live; it does not claim that the latency issue was fixed.

## Rollback and recovery ownership

App rollback and DB recovery are deliberately separate:

- The NUC deploy workflow owns the app image. If container startup or health
  fails after switching, it restores the exact previous image automatically.
  If no previous image exists, it stops the incompatible new container.
- Forward DB migrations remain in place during app-image rollback. Every
  enabled migration must therefore be compatible with the previous app and
  cached browser bundles that may outlive an app switch. Removing a public RPC
  shape needs an explicit staged-client deprecation plan, not merely a
  repository caller audit.
- The migration's owning issue owns DB recovery. Issue #407 owns migration 156
  and its per-session rhythm contract; issue #332 owns migration 155
  idiom-session consumption; issue #394 owns migration 154 exercise hardening;
  issue #393 owns migration 153 phase 1 and #399 owns its
  strict phase-2 cutoff. Issue #243 owns migration 128;
  issue #238 owns migration 127. Issue #232 retains ownership of migration 126;
  #233 owns gate/ledger/probe machinery.
- Any explicit DB rollback must be reviewed as a complete contract transition:
  restore compatible functions and indexes, then reconcile the matching ledger
  and state rows in the same recovery plan. Never advertise contract 128 after
  removing its bounded selector function or sibling-count index.
- Never improvise reverse SQL in the workflow. Preserve the failed run, exact
  commit, contract ID, last applied migration lines, and health response; then
  use the owning issue's reviewed recovery path.
- A retry with the same immutable contract is the normal recovery after a
  transactional migration failure. Applied rows are verified/no-op; the failed
  migration is attempted again.

CI proves that recovery path against a real disposable PostgreSQL database: a
fixture fails after visible DDL, both the DDL and migration ledger row are
verified absent, then the repaired immutable input succeeds on the same
database and its next replay is verified as a no-op. Separate real-PostgreSQL
coverage proves that the pre-switch probe rejects writes, warns after a
successful over-budget read, times out at its declared safety bound, reruns
after committed migrations, and preserves all learner
state for the exact QA identity.

## First-call latency ownership

The migration-126 rollout first observed a 3,282.6 ms read followed by warm p50
126.1 ms. A later no-op deployment timed out the same exact read after two
seconds, disproving the earlier one-time-post-DDL explanation. Read-only
production diagnostics then showed one warm call touching 18,853 shared blocks
(about 147 MB of buffer traffic) for a 71 MB `word_entries` heap. The default
scope had no narrow NT2 index, and session-plan counts still executed
selector-only ordering plus repeated learner-setting lookups.

Migration 127 adds a narrow, trigger-synchronized projection of trainable NT2
entry identities and a count-only default session-plan path. Dictionary access,
learner settings, status, and today's review sets are each resolved once. List
and filtered plans retain the authoritative selector fallback. On a disposable
production-shaped fixture, the previous contract touched 15,409 shared blocks.
An index-only version fell back to 10,066 after distributed NT2 heap pages were
dirtied; the synchronized projection stayed at 1,825 blocks and 16.647 ms after
both source and projection visibility were invalidated. Queue counts remained
identical across single-mode `both`/`new`/`review` and multi-mode cases. CI keeps
a 4,000-block and 2,000-ms benchmark budget. The production pre-switch probe
remains exactly read-only; #454 separates the two-second performance warning
from its 10-second safety timeout so #413 does not block a healthy pilot release.

Migration 127 takes a `SHARE ROW EXCLUSIVE` source-table lock before installing
the projection trigger and taking the backfill snapshot. Training and other
readers remain available; dictionary import writes wait for the short migration
transaction and then execute through the committed trigger. Do not split the
lock, trigger installation, backfill, or reconciliation into separate runs.

After migration 127, the exact production QA benchmark measured the session
plan at 192.2 ms on its first call, but the actual `get_next_card` call still
took 2,471.3 ms. The production-shaped dirty/wide fixture reproduced the split:
the selector touched about 22,050 shared blocks, of which the scheduler owned
about 16,254 and the final selected-card projection about 6,256. The pointer
helper was only about 390 blocks.

Migration 128 makes the existing authoritative scheduler use migration 127's
narrow projection whenever no list is selected, while retaining the original
wide membership branch for curated and user lists. Today's new words/cards,
known marks, and learner status are materialized once instead of probed per
candidate. An exact `(dictionary_id, language_code, headword)` index bounds the
single selected card's `meanings_count`. The same dirty/wide fixture falls to
3,037 blocks and 37.231 ms: 2,800 for scheduling, 726 for final projection, and
411 for the pointer helper. Candidate results remain byte-identical after
removing randomized `selection_order` across default `both`/`new`/`review`,
multi-mode, entry exclusion, and exact-card exclusion cases. Existing FSRS RPC
coverage remains authoritative for list, filtered, access, pointer, known,
hidden, legacy null-dictionary, cap, and queue behavior.

Migration 129 adds independent `reading_size_phone` and
`reading_size_desktop` text columns to `user_settings`. Each defaults to
`normal` and is constrained to `normal`, `large`, or `largest`; existing rows
are backfilled to `normal` without changing unrelated preferences. The
first-party UI may update these app-local columns directly under the existing
user-scoped RLS policy.

## Production QA sessions

The deploy never mints, copies, or revokes an Auth session. Production smoke
must use only `scripts/ab-auth-prod.sh`, which verifies the dedicated QA identity
before opening the site.

- Keep the wrapper process alive for the whole smoke; do not copy its session
  JSON or browser profile.
- Normal exit, failure, or interruption clears browser storage, globally
  revokes the QA session, and removes its temporary artifacts.
- If revocation fails, the wrapper preserves a protected recovery directory and
  prints only its path. Do not delete it. With the same private env file, set
  `QA_SESSION_JSON_PATH` to its `prod-session.json` and run
  `apps/ui/scripts/revoke-prod-qa-session.ts`; delete the recovery directory only
  after that command succeeds.
- Do not use a personal/reference account for smoke. Read-only smoke remains the
  default; mutations require their own owning issue.

See `docs/runbooks/production-login.md` for the identity and cleanup contract.
