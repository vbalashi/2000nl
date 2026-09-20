# Collection/training current-state map

Date: 2026-09-20
Scope: bounded audit of the current 2000nl repository; no implementation changes.
Status vocabulary:

- `AVAILABLE_NOW` — the current schema/API has the behavior and repository tests exercise its contract.
- `PARTIAL` — a usable part exists, but at least one owner-approved semantic is missing or different.
- `NOT_IMPLEMENTED` — no current storage/API/runtime was found for the behavior.

The target contract audited here is
`docs/intent/search-and-lists/collection-training-contract.md`, with decision
provenance in
`docs/intent/search-and-lists/collection-composition-decisions.md` (C1-C28).
This report distinguishes that target from the current runtime.

## Executive result

The current runtime already has a strong training/session foundation: static
curated and user list memberships, provenance-aware card actions, canonical
four-grade FSRS mutation, access-checked candidate selection, finite server-side
session latching, and evidence-checked replacement of members that become
permanently unavailable.

It does **not** yet have the proposed generic collection layer. There are no
rule definitions, collection dependency edges, nested collection evaluation,
generic materialization revisions/jobs, refresh state, or training-preset
storage. VanDale 2k is a special importer-maintained materialized list, not an
instance of a generic rule-collection engine.

The existing history filters are only a pilot subset of the target behavior:
they accept one provenance source selector and one calendar study-day selector.
They do not support action/result predicates, trailing `X * 24h` windows, direct
dictionary-set selection, or the required partial-access notice. In particular,
the current `daysAgo: 7` means “the study day exactly seven days ago”, not “the
last seven days”.

## 1. Dictionary, list, and collection storage

### Current storage

| Object | Current representation | Evidence | Status |
| --- | --- | --- | --- |
| Dictionary content | `dictionaries`, `word_entries`; each entry retains dictionary identity and a specific entry/meaning identity | `db/migrations/001_core_schema.sql`; `packages/docs/data-model.md` | `AVAILABLE_NOW` |
| Curated/system list | `word_lists`; membership in `word_list_items(list_id, word_id, rank)` | `db/migrations/001_core_schema.sql` (`word_lists`, `word_list_items`) | `AVAILABLE_NOW` |
| User/manual list | `user_word_lists`; membership in `user_word_list_items(list_id, word_id, added_at)` | `db/migrations/004_user_features.sql`; CRUD in migrations `018`, `024`, `025`, `027` | `AVAILABLE_NOW` |
| List-level training hints | `default_scenario_id`, `card_policy`, `card_type_ids` on curated/user lists | `db/migrations/040_list_training_intent.sql` | `AVAILABLE_NOW` |
| Generic rule collection | No rule/source/filter columns or rule table found | No `collection_rule`, dependency, expression, or evaluator symbols under `db`, `apps/ui`, or `packages` | `NOT_IMPLEMENTED` |
| Nested collection source | No collection-to-collection dependency edge or cycle checker found | Same negative inventory; current selector accepts one list ID but a list cannot itself be defined from another list | `NOT_IMPLEMENTED` |
| Generic materialization | No published result revision, build job, stale/refresh/error state, or atomic publication contract found | Same negative inventory | `NOT_IMPLEMENTED` |
| Saved training preset | No preset table/API found | No `training_preset` or equivalent product storage under `db`, `apps/ui`, or `packages` | `NOT_IMPLEMENTED` |

### What VanDale 2k is today

`word_lists` seeds `nt2-2000` / “VanDale 2k”, while each source entry also has
`word_entries.is_nt2_2000`. During a dictionary import,
`packages/ingestion/src/importer/source_import.py` builds `nt2_rows` from that
flag, deletes obsolete source-managed `word_list_items`, and upserts the current
members and ranks. `packages/ingestion/tests/integration/test_import.py` covers
the import/reimport behavior.

Therefore VanDale 2k is:

- materialized references to `word_entries`, not copied dictionary content;
- automatically reconciled **when the importer runs**;
- read as stored membership between imports;
- not a live `WHERE is_nt2_2000` query every time the list is opened;
- not backed by a reusable rule-collection definition or generic refresh job.

The default no-list training scope is separately materialized in
`private.default_training_scope_entries_v1` by migration
`127_bounded_training_session_plan_io.sql`. A trigger follows changes to
`word_entries.is_nt2_2000`, `raw`, and `dictionary_id`. This is a scheduler
optimization for the default 2k scope, not generic collection materialization.

### Manual-list identity and cross-dictionary membership

`user_word_list_items.word_id` points directly to an entry. There is no
dictionary restriction on the list membership table, so one manual list can
contain entries from several dictionaries. Duplicate membership of the same
entry is prevented by the `(list_id, word_id)` primary key. Equal spellings in
different entries remain distinct IDs.

## 2. Training source selection, filters, planning, and latching

### Current selection inputs

The ordinary scheduler boundary is
`private.training_scheduler_candidates_v2(...)`, currently defined by
`db/migrations/142_renderable_ordinary_training_candidates.sql` and consumed by
the public selection/plan/session RPCs. Its source arguments are:

- `p_list_id uuid`;
- `p_list_type text` (`curated` or `user`);
- or no list ID, which means the default NT2 2k scope;
- `p_card_type_ids` for direction/mode;
- `p_card_filter` (`new`, `review`, `both`);
- `p_training_filter` for the current provenance/date pilot.

There is no `dictionary_id`, `dictionary_ids`, “all accessible dictionaries”,
or arbitrary source-expression argument. One selected manual list can indirectly
span dictionaries, but that is not the approved dictionary picker from C26.

### Current history filter shape

`apps/ui/lib/types.ts` defines `TrainingFocusFilter` with:

```text
dateWindow: all | today | yesterday | daysAgo
daysAgo?: number
sourceKind?: string
sourceId?: string
externalId?: string
```

The UI is `apps/ui/components/training/pilot/TrainingTodaySetup.tsx`; the RPC
helpers originate in `db/migrations/086_training_source_filters.sql` and are
kept aligned with the current scheduler in migration `142`.

All active constraints are applied to the same `user_card_action_events` row in
the scheduler's `matched` CTE, so source/date mixing between different events
does not occur. With no source selector, events from all provenance sources can
match. The result deduplicates by `(entry_id, card_type_id)`.

Current semantic gaps:

1. `private.training_filter_target_date_at(...)` in migration
   `147_local_study_day_authority.sql` returns one study-day date. `daysAgo: X`
   selects exactly that date; it is not a trailing elapsed-time interval.
2. Session rows retain the filter JSON, but they do not store fixed start/end
   instants for a trailing window. The target 168-hour contract is absent.
3. The `matched` CTE does not filter `event.action` or `event.result`. Any matching
   action event can satisfy the current pilot filter.
4. There is no “encountered”, “graded”, or “forgotten” selector in the current
   `TrainingFocusFilter` type or Setup UI.
5. The filter admits only cards with current `user_card_status` (`has_status`),
   then applies scheduler eligibility. It does not create learning state merely
   because an event exists.

### Planning and finite sessions

Current public RPCs and ownership:

| RPC | Purpose | Current owner/evidence |
| --- | --- | --- |
| `get_training_session_plan(...)` | Authoritative counts for selected source/filter/modes | migrations `123`, `127`, `132`, consolidated in `140`; tests in `trainingSessionPlanRpc.test.ts` |
| `start_training_session(...)` | Creates server-owned session and latches selected members | migrations `133`, `139`, active-run wrapper in `153` |
| `get_training_session_snapshot(...)` | Returns immutable identities plus consumed/unavailable state | migrations `133`, `139`, wrapper in `153` |
| `get_next_training_session_card(...)` | Reads first available unconsumed latched member | migrations `134`-`136`, wrapper in `153` |
| `mark_training_session_member_unavailable(...)` | Evidence-checks a permanent failure and optionally adds a replacement | migrations `136`, `139`, `142`, wrapper in `153` |

Migration `139_session_action_budget.sql` accepts any positive integer session
size plus `all-due-today`; the current Setup UI exposes 5, 10, and all due today.
Repository DB tests also exercise a 50-action session. The persisted
`requested_total` is an accepted-action budget, not a word count.

`training_session_members` stores ordinal, entry, card type, queue source,
consumption, and unavailability. The identity fields are protected by an
immutability trigger. Migration `153_single_active_training_run.sql` adds the
single-active-run authority fence, so a superseded session cannot grade another
card.

The latching behavior is `AVAILABLE_NOW`: later list/scheduler mutations do not
silently replace already latched members. Replacement after a permanent member
failure is a separate current behavior described below.

## 3. Review/event semantics and exact grade mapping

### Canonical four buttons

| User label | V2 `reviewResult` / DB result | FSRS grade |
| --- | --- | --- |
| Again / Forgotten / Снова | `fail` | `1` |
| Hard / Трудно | `hard` | `2` |
| Good / Хорошо | `success` | `3` |
| Easy / Легко | `easy` | `4` |

Evidence:

- button/hotkey vocabulary: `apps/ui/components/training/trainingHotkeys.ts`;
- keyboard and capability mapping:
  `apps/ui/components/training/v2/TrainingSenseCardStage.tsx`;
- canonical order:
  `apps/ui/components/training/v2/trainingSenseCardModel.ts`;
- request enum: `packages/shared/types/platformV2.ts` and
  `apps/ui/lib/platform/platformV2ActionRequest.ts`;
- grade conversion: `handle_card_review(...)` in
  `db/migrations/059_security_harden_user_scoped_rpcs.sql` (original mapping is
  also visible in migration `002_fsrs_engine.sql`).

For the owner-approved vocabulary:

- “forgotten” means specifically `action = 'review-card'` and
  `result = 'fail'`;
- “graded/viewed with one of the four buttons” means `action = 'review-card'`
  and `result IN ('fail', 'hard', 'success', 'easy')`;
- `hard`, `success`, and `easy` are three degrees of successful recall;
- a generic row in `user_card_action_events` is **not** sufficient evidence of
  one of those four buttons, because that table also stores `start-learning`,
  `mark-known`, `undo-known`, and legacy `record-view`/`mark-unknown` actions.

That last distinction is a current gap in filtered selection: the scheduler's
current `matched` CTE matches any action event and has no result predicate.

### V2 Known is not the Easy button

In Platform V2, `mark-known` creates a durable Known mark and does not call
`handle_card_review(..., 'easy')`. The four training buttons use
`review-card`. This is visible in
`public.perform_platform_v2_card_action(...)` from migration
`113_platform_v2_known_marks.sql`:

- `mark-known` inserts `user_card_known_marks`;
- `start-learning` calls `start_learning_entry_card(...)`;
- `review-card` calls `handle_card_review(...)` with the supplied grade.

The older V1 `perform_platform_card_action(...)` contract maps `mark-known` to
`easy` and `mark-unknown` to `fail`; that compatibility behavior is documented
in `docs/reference/platform-provenance-rpc.md`. A new video-grade integration
must use the V2 four-grade `review-card` contract rather than treating V2 Known
as Easy.

### External provenance and atomic FSRS mutation

`POST /api/platform/v2/actions/library` is the explicit first-party non-session
route. Connected clients use the principal-aware action boundary with
`platform:write`; the route/service resolves to
`perform_platform_v2_card_action_as_principal(...)`, then to
`perform_platform_v2_card_action(...)`.

For an accepted V2 `review-card`, the same database transaction:

1. verifies exact entry/card identity, access, state revision, actor, and
   `clientEventId`;
2. normalizes/upserts source, artifact, and location provenance;
3. inserts one `user_card_action_events` row with action/result/provenance;
4. calls `handle_card_review(...)` for the same `(user, entry, card type)`;
5. writes an idempotent action receipt.

The exact write implementation is in migration
`113_platform_v2_known_marks.sql`; service-principal delegation is in migration
`114_platform_v2_service_principal_actions.sql`; source tables originated in
migrations `077`-`083`. The current contract is `AVAILABLE_NOW` and has RPC/API
tests listed in section 7.

## 4. Why a latched member can become unavailable after session start

A session member does not disappear merely because its source list changed.
The membership identity remains latched. “Unavailable” is reserved for a
permanent, server-verifiable inability to present that specific exercise.

Current ordinary-card reasons accepted by the code are:

| Reason | Exact current condition | Evidence |
| --- | --- | --- |
| `dictionary-access-revoked` | Entry still exists, but `can_access_dictionary(...)` is false at read/retirement time; examples include entitlement/subscription revocation after session start | migration `136_training_unavailable_members.sql`; end-to-end recovery test in `trainingFailureRecovery.test.ts` |
| `entry-not-found` | The latched entry can no longer be read | migration `136`; note that the FK uses `ON DELETE RESTRICT`, so ordinary deletion while referenced is constrained; this is mainly a defensive/runtime-drift diagnostic |
| `projection-missing` | Current Platform presentation identity/group cannot project the member | migration `136`; projection-precedence test in `trainingSessionPlanRpc.test.ts` |
| `model-invalid` | Current entry payload/schema is no longer renderable, including invalid JSON shape or required user-entry content missing | migration `136`; tests in `trainingSessionPlanRpc.test.ts` |
| `reverse-definition-missing` | A latched reverse card no longer has a usable definition | migration `136` |
| `direct-example-missing` | A previously latched later-meaning direct card is no longer renderable under the ordinary direct-recall contract | migration `142_renderable_ordinary_training_candidates.sql`; sparse-member test in `trainingSessionPlanRpc.test.ts` |

The selector returns a diagnostic; only
`mark_training_session_member_unavailable(...)` mutates the member, and it
rechecks the claimed reason against current server evidence. Network timeouts,
temporary provider errors, and arbitrary client claims are not valid reasons.

Migration `139_session_action_budget.sql` tries to add a replacement without
spending the accepted-action budget. This is already implemented, but it is not
yet the full target collection-revision contract: the replacement query reuses
the session's stored list/filter configuration against the **current** candidate
relation. There is no retained generic collection-result revision from which to
prove that a replacement was in the original published pool. Treat that future
collection parity requirement as `PARTIAL`, not as solved by current latching.

## 5. Access loss and partial-source behavior

### Before session start

`private.training_scheduler_candidates_v2(...)` builds a materialized set of
readable dictionaries using `can_access_dictionary(...)`. Both default-scope and
list-scope candidates exclude entries whose dictionary is not readable. Tests in
`trainingSessionPlanRpc.test.ts` cover system, owned, public, entitled, denied,
and null-dictionary entries; `fsrsRpc.test.ts` also covers inaccessible dictionary
exclusion.

If one manual list contains accessible and inaccessible dictionaries, the
accessible candidates remain trainable. This supplies the reduction mechanics
of C28. The current plan/session response does not report how many source
materials were excluded and the current Setup has no required partial-access
notice. It also cannot preserve a configured explicit dictionary subset because
such a source selector/preset does not yet exist. Classification: `PARTIAL`.

### During an active session

Every next-card projection rechecks dictionary access. If access was revoked
after latching, the selector returns the `dictionary-access-revoked` diagnostic;
the evidence-checked mutation marks that member unavailable and attempts a
replacement. It never displays the revoked content. This current behavior is
`AVAILABLE_NOW` for a latched ordinary-card session.

### Entire source unavailable

Current static lists have no independent “source unavailable” lifecycle state,
and generic derived collections/presets do not exist. An inaccessible list entry
is filtered at entry level; an invalid/unowned user list produces no valid plan.
Preserving and visibly marking unavailable rule/preset configuration is
`NOT_IMPLEMENTED`.

## 6. C1-C28 target-behavior classification

| Decision | Target behavior | Current classification | Current evidence / missing piece |
| --- | --- | --- | --- |
| C1 | Manual and rule collections; materialization is implementation detail | `PARTIAL` | Manual static lists exist; no rule collections/materialization framework |
| C2 | Automatic rule membership refresh | `NOT_IMPLEMENTED` | VanDale 2k importer refresh is special-purpose only |
| C3 | Previous complete result, atomic publish, refresh/failure state | `NOT_IMPLEMENTED` | No generic result revision/build state |
| C4 | Started session retains selected membership | `AVAILABLE_NOW` | `training_sessions` / immutable `training_session_members`, migrations `133`-`139` |
| C5 | Start rules while collection refreshes | `NOT_IMPLEMENTED` | No rule refresh lifecycle |
| C6 | Reject direct/indirect collection cycles | `NOT_IMPLEMENTED` | No dependency graph |
| C7 | Rolling time filters only in training/presets | `PARTIAL` | Training date filter exists, but it is exact study-day, not trailing duration; no presets |
| C8 | History spans sources unless narrowed; same event satisfies all predicates | `PARTIAL` | Same-row source/date predicates exist; action/result predicates absent |
| C9 | `X * 24h` window anchored and retained at session start | `NOT_IMPLEMENTED` | Current `daysAgo` resolves one study day from current reference time |
| C10 | Later success does not erase earlier forgotten match; scheduler remains independent | `PARTIAL` | Event history is append-only and scheduler remains separate, but forgotten predicate is absent |
| C11 | Block collection deletion while dependent collections exist | `NOT_IMPLEMENTED` | No collection dependencies |
| C12 | Upstream rule change gates derived training | `NOT_IMPLEMENTED` | No rules/dependency revisions |
| C13 | Old complete result usable after data refresh failure | `NOT_IMPLEMENTED` | No generic materialization refresh state |
| C14 | Apply collection-compatible filters directly in Setup | `PARTIAL` | List + card/source/date filters exist; lexical POS/rule parity does not |
| C15 | Preset stores recipe, not membership | `NOT_IMPLEMENTED` | No preset storage/API |
| C16 | Preset reference blocks collection deletion | `NOT_IMPLEMENTED` | No presets/dependency guard |
| C17 | Preserve unavailable source configuration; never use inaccessible content | `PARTIAL` | Entry access is enforced, including active-session revocation; configuration lifecycle absent |
| C18 | Dictionary may directly source training/preset | `NOT_IMPLEMENTED` | Selector has list/default-2k source only; no dictionary ID source |
| C19 | One source per rule collection in v1 | `NOT_IMPLEMENTED` | No rule collections |
| C20 | Encounter requires explicit interaction, not subtitle presence | `PARTIAL` | Provenance events require explicit action; no dedicated encounter predicate and current filter matches all actions |
| C21 | Forgotten mark targets selected entry/meaning only | `AVAILABLE_NOW` | Actions require exact `entry_id` + `card_type_id`; no spelling fan-out |
| C22 | Learning state/due belongs to training, not collection membership | `AVAILABLE_NOW` | `p_card_filter`, `user_card_status`, scheduler eligibility; static memberships unaffected |
| C23 | History collection proposal | `NOT_IMPLEMENTED` | Superseded by C24; must remain absent |
| C24 | All history conditions only in training/presets | `PARTIAL` | Pilot training history filters exist; no action/result semantics or presets |
| C25 | Marked entries may span dictionaries | `PARTIAL` | Mixed manual list/default accessible 2k can span dictionaries; arbitrary all-accessible pool cannot |
| C26 | All-accessible or explicit multiple dictionaries in Setup/presets | `NOT_IMPLEMENTED` | No dictionary-set selector or preset |
| C27 | External grade uses canonical FSRS + atomic provenance | `AVAILABLE_NOW` | V2 `review-card` + source context + idempotent receipt in migrations `113`/`114` |
| C28 | Continue with accessible subset and show exclusion notice | `PARTIAL` | Scheduler reduces to accessible entries; required notice/count and recipe preservation absent |

## 7. Executable current tests, RPCs, and routes

### Safe execution order for a junior agent

Do not invent tests for absent generic collection/preset APIs. First run the
existing contracts below. A missing target feature should be recorded as
`NOT_IMPLEMENTED` from schema/code inventory, not forced into a failing runtime
test.

1. Static/API tests without a database:

   ```bash
   cd apps/ui
   npm test -- tests/api/platformV2ActionsRoute.test.ts tests/trainingService.selection.test.ts
   ```

2. Full disposable-database FSRS/training suite:

   ```bash
   scripts/db-local-supabase.sh test-fsrs
   ```

   This creates and removes its own local test database. The safety contract is
   enforced by `apps/ui/tests/fsrs/dbTestUtils.ts`: only loopback hosts and
   `fsrs_test` / `2000nl_fsrs_*` database names are accepted.

3. Import/materialized-list reconciliation:

   ```bash
   scripts/bootstrap-worktree.sh --install --ingestion
   scripts/db-local-supabase.sh test-ingestion
   ```

4. Narrow UI behavior after the contract tests pass:

   ```bash
   cd apps/ui
   npm test -- tests/TrainingScreen.test.tsx
   ```

### Existing tests to reuse as evidence

| Concern | Existing executable evidence |
| --- | --- |
| Four-grade FSRS mapping, lapse, read-only lookup | `apps/ui/tests/fsrs/fsrsRpc.test.ts`: `handle_card_review creates then updates card state`, `handle_card_review fail counts as lapse`, `dictionary lookup does not mutate FSRS or review logs` |
| Provenance atomicity/idempotency | `fsrsRpc.test.ts`: source-context-v2 review-turn, idempotency, canonical YouTube, and private-source tests; `apps/ui/tests/fsrs/platformKnownMarkRpc.test.ts` |
| V2 route shape and typed conflicts | `apps/ui/tests/api/platformV2ActionsRoute.test.ts` |
| Current source/date filter | `fsrsRpc.test.ts`: `get_next_filtered_card filters by local date window and source`; `get_training_filter_sources returns safe user-owned source labels` |
| Session plan and latching | `apps/ui/tests/fsrs/trainingSessionPlanRpc.test.ts`: finite bounds, configured order, immutable membership, exact drains, 50-action budget |
| Access filtering | `trainingSessionPlanRpc.test.ts`: scheduler access matrix; `fsrsRpc.test.ts`: inaccessible dictionary exclusion |
| Access revoked after start and recovery | `apps/ui/tests/fsrs/trainingFailureRecovery.test.ts` |
| Evidence-checked unavailable reasons/replacement | `trainingSessionPlanRpc.test.ts`: projection, model-invalid, sparse direct, replacement/exhaustion cases |
| Single active run and stale-session fencing | `apps/ui/tests/fsrs/trainingRunAuthority.test.ts` |
| Setup source/date persistence | `apps/ui/tests/TrainingScreen.test.tsx`: `pilot Setup applies source and date filters only when Start commits the draft` |
| VanDale 2k importer reconciliation | `packages/ingestion/tests/integration/test_import.py` |

### RPC calls a junior agent can probe directly

Use an authenticated transaction (`request.jwt.claim.sub`) and deterministic
fixture IDs, following the helpers in `apps/ui/tests/fsrs/dbTestUtils.ts`.

| Probe | Expected evidence |
| --- | --- |
| `get_available_word_lists(user, language, type)` | Curated and owned user lists with stored counts |
| `get_training_filter_sources(user, limit)` | Only this user's source labels/counts |
| `get_training_session_plan(user, modes, list_id, list_type, card_filter, filter, size)` | Planned counts and requested action budget |
| `start_training_session(...)` then `get_training_session_snapshot(...)` | Fixed ordered member identities and stored filter/configuration |
| Mutate source list membership after start, then reread snapshot | Existing session members unchanged |
| `get_next_training_session_card(...)` | First unconsumed, available latched member |
| Revoke one member's dictionary entitlement, reread next card | Stable `dictionary-access-revoked` diagnostic, not protected content |
| `mark_training_session_member_unavailable(...)` | Evidence-checked unavailable state and replacement/exhaustion status |
| V2 `review-card` with YouTube `source-context-v2` | One action event, one review log entry, changed FSRS state, source linkage, one receipt |
| Retry same `clientEventId` | Duplicate response with no second mutation/event |

### API routes currently available

| Route | Current role |
| --- | --- |
| `POST /api/platform/v2/actions` | Training action path; current explicit Training requires `trainingSessionId` |
| `POST /api/platform/v2/actions/library` | First-party non-session card action path |
| `POST /api/platform/v2/actions/reconcile` | Authoritative action-receipt reconciliation |
| `GET /api/platform/learning/activity` | Provenance/history read surface |
| `GET /api/platform/learning/cards` | Card-centric learning/provenance read surface |

The V2 action routes are feature-gated by current rollout configuration; route
tests show the fail-closed `503` behavior when disabled.

## 8. Deterministic data needed for follow-up validation

The existing repository tests create focused fixtures inline. For the planned
cross-feature validation report, add one explicit fixture family rather than
relying on production VanDale data:

1. Two users: owner `U`, unrelated user `V`.
2. Four dictionaries:
   - `D_SHARED`, readable by `U`;
   - `D_PERSONAL`, owned/readable by `U`;
   - `D_REVOKABLE`, initially entitled to `U`;
   - `D_DENIED`, never readable by `U`.
3. At least 60 distinct entry IDs so a 50-action session has spare replacement
   candidates. Include 20 nouns, 20 verbs, 10 adjectives, and 10 entries with
   deliberately varied/missing lexical metadata. Put equal spellings in two
   dictionaries and two meanings of one spelling in `D_SHARED`.
4. One curated list and one user list with known overlaps, duplicates by
   spelling but not ID, cross-dictionary members, denied members, and at least
   55 renderable candidates.
5. Learning state per card direction: untracked, learning due, review due,
   future due, Known, hidden, frozen, and both direct/reverse targets.
6. Two YouTube sources (`VIDEO_A`, `VIDEO_B`) and one web source. For selected
   entries, record each canonical grade and non-grade actions separately.
7. Boundary events relative to fixed `T`:
   `T`, `T-168h`, `T-168h-1ms`, `T-24h`, and `T+1ms`; retain database-created
   timestamps in evidence. These cannot validate the target trailing-window
   contract until that filter exists, but they make the current exact-day
   mismatch observable.
8. One latched member per unavailable reason that can be produced without
   violating referential constraints: revoked entitlement, projection missing,
   invalid model, missing reverse definition, and sparse later-meaning direct
   card. Keep a valid replacement outside the initial latched membership.

For each run, record: fixture manifest/hash, migration head, exact SQL/API input,
returned IDs/counts/order, `EXPLAIN (ANALYZE, BUFFERS)` for selection queries,
wall-clock repetitions, and before/after rows from `user_card_status`,
`user_review_log`, `user_card_action_events`, `training_sessions`, and
`training_session_members`. Redact private content; IDs and aggregate counts are
sufficient for access-loss notices.

## 9. Unknowns explicitly left as unknown

- No current code establishes generic materialization freshness targets,
  nesting limits, collection job retry policy, or published revision retention.
- No current code establishes a partial-access notice payload/count that avoids
  information leakage.
- No current code establishes delayed/offline event-time semantics for the
  proposed trailing window; current filtering uses server `created_at` and an
  exact study-day date.
- No current code establishes a lexical collection-filter inventory or a policy
  for missing part-of-speech metadata.

These are implementation gaps, not evidence that the approved product semantics
should be changed.

## Audit execution note

The static audit and path/symbol checks completed. The narrow command in section
7 was also attempted in this checkout, but local UI dependencies are not
installed (`vitest: command not found`), so this audit does not claim a fresh
green test run. The commands and existing test cases above are the handoff for a
bootstrapped worktree; no dependency installation was performed as part of this
bounded research task.

Changed file: `docs/research/collection-training-current-state-map-2026-09-20.md`
