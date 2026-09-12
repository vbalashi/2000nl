# API Functions: Training And Queue

## Authentication

Use authenticated Supabase clients:

```javascript
const { data, error } = await supabase.rpc('function_name', { params });
```

Functions in this group validate that `p_user_id` matches `auth.uid()`.

## Content-bound Exercise Target contract (migrations 151–152)

Idioms and sentence-translation exercises use the shared `training-exercise-v1`
identity. An idiom target names its exact Platform V2 `content_node_id` and
direction; a translation target names its source sentence node and uses one
`recall` direction. Translation language is presentation configuration, not a
progress key. Existing ordinary meaning state remains on `entry_id +
card_type_id`.

`read_platform_v2_training_exercise_target_v1(p_user_id, p_target_key)` is a
service-role-only read boundary for the target projection and that learner's
additive state. It returns retired targets with their visibility status so a
consumer can stop showing them without deleting FSRS state or action history.

Migration 152 adds the first idiom runtime boundary. The service-role-only
`read_platform_v2_idiom_exercise_candidates_as_principal_v1` wrapper returns
only active idiom nodes that have an active explanation and whose headword
group contains an ordinary meaning the learner has enrolled or marked Known.
It supports `direct` and `reverse` independently. The response includes
content-node diagnostic locators for the expression, explanation, and optional
examples; the application resolves those locators through the normal gated V2
content read before rendering, so the database contract does not treat a
locator as user-visible text.

`perform_platform_v2_idiom_exercise_action_as_principal_v1` accepts only
self-assessed `fail`, `hard`, `success`, or `easy` results. It uses the shared
FSRS engine in additive `user_training_exercise_state`, records a
target-bound action event and idempotency receipt, and never writes ordinary
word state, Learn/Known marks, or ordinary review history. A repeated client
event is a safe duplicate; the same event ID with a changed payload fails
closed. The wrapper remains service-role-only until the application consumer
and launch UI are enabled by #332/#331.

## `get_next_card`

Get the next card for training. The current fresh-deploy function accepts explicit card modes; callers that work from a scenario must resolve that scenario to its `card_modes` first.

```sql
get_next_card(
    p_user_id uuid,
    p_card_type_ids text[],
    p_exclude_entry_ids uuid[],
    p_list_id uuid,
    p_list_type text,
    p_card_filter text,
    p_queue_turn text,
    p_exclude_card_keys text[],
    p_allow_practice boolean
) RETURNS SETOF jsonb
```

The finite-session contract adds a required `p_allow_practice boolean` as the
ninth argument. The current pilot sends `false`, so a 5-card, 10-card, or
all-due-today session cannot silently grow with future practice cards.

Migration `141` retains the immediately preceding eight-argument public shape
as a cached-client adapter. It forwards to this canonical signature with
`p_allow_practice = false`; it is not a second scheduler implementation and
does not restore any private v1 candidate function. The analogous filtered
nine-argument public shape is retained under the same rule. The older
`*_without_known` bypass names remain retired.

Parameters:
- `p_user_id`
- `p_card_type_ids`
- `p_exclude_entry_ids`
- `p_list_id`
- `p_list_type`
- `p_card_filter`
- `p_queue_turn`
- `p_exclude_card_keys` – session exclusion by card identity using `entry_id:mode`, so another mode for the same entry can still be selected.

Example:
```javascript
const { data: cards } = await supabase.rpc('get_next_card', {
  p_user_id: user.id,
  p_card_type_ids: ['word-to-definition'],
  p_exclude_entry_ids: [],
  p_exclude_card_keys: [],
  p_card_filter: 'both',
  p_list_id: null,
  p_list_type: 'curated',
  p_queue_turn: 'auto',
  p_allow_practice: false
});
```

Notes:
- Legacy word-named scheduler overloads are dropped after the card-oriented
  scheduler migration sequence; callers must use the current card contract.
- Selection is filtered through `can_access_dictionary(...)`; inaccessible private dictionaries are not schedulable.

## `get_next_training_session_card`

Read the first still-available member of a server-owned finite session. Reads
are side-effect free: they never consume or retire a member. The
exclusion-aware form is used by speculative next-card preparation so the card
currently on screen (or another card already accepted in this browser
session) cannot be returned as the next member.

```sql
get_next_training_session_card(
    p_user_id uuid,
    p_session_id uuid,
    p_exclude_card_keys text[]
) RETURNS SETOF jsonb
```

`p_exclude_card_keys` uses the same `entry_id:card_type_id` identity as
`get_next_card`. The two-argument form remains an explicit wrapper around the
three-argument implementation for callers that do not need exclusions; it does
not create a second selection algorithm. If the first latched member has lost
dictionary access or can no longer be projected into a card, the selector
returns a diagnostic object with `trainingSessionUnavailable`, `entryId`,
`cardTypeId`, `trainingSessionOrdinal`, and a stable `reason`; it does not
change the database. The caller must then invoke the explicit authenticated
`mark_training_session_member_unavailable` action and retry selection. Network
or provider failures are not this diagnostic and remain retryable on the same
member. Membership is consumed only by the authenticated Platform action
transaction, not by this selector.

## `mark_training_session_member_unavailable`

Retire one latched member after the selector has returned a permanent access or
content diagnostic. This is the sole mutation path for `unavailable_at` and
`unavailable_reason`; it enforces ordinal order, is safe to retry, and marks
the session complete when no unconsumed available members remain.

```sql
mark_training_session_member_unavailable(
    p_user_id uuid,
    p_session_id uuid,
    p_entry_id uuid,
    p_card_type_id text,
    p_reason text
) RETURNS jsonb
```

Allowed reasons are `dictionary-access-revoked`, `projection-missing`,
`entry-not-found`, `model-invalid`, and `reverse-definition-missing`.

## `get_training_session_plan`

Return the authoritative exact-card work snapshot for one effective Training
scope. This is the only source for a session ratio or progress bar; daily-new
settings and due counters are not themselves a session total.

```sql
get_training_session_plan(
    p_user_id uuid,
    p_card_type_ids text[] DEFAULT ARRAY['word-to-definition'],
    p_list_id uuid DEFAULT NULL,
    p_list_type text DEFAULT 'curated',
    p_card_filter text DEFAULT 'both',
    p_training_filter jsonb DEFAULT '{}'
) RETURNS jsonb
```

The finite-session overload adds a required `p_session_size text` as the
seventh argument. It accepts any positive integer or `all-due-today`. A finite
integer is the requested number of accepted exercises across new and due work;
it is not a daily-new cap. `all-due-today` takes all immediately eligible new,
learning, and review work and excludes future practice. FSRS calculations and
review intervals are unchanged.

Finite sessions create a server-owned membership snapshot through
`start_training_session`; subsequent reads use `get_next_training_session_card`
and accepted actions consume that snapshot atomically. For a finite session,
`requestedTotal` is the stopping target. `plannedNew`, `plannedReview`, and
`plannedTotal` describe the membership available when the session is created,
so `plannedTotal` may be lower than `requestedTotal` when eligible work runs
out. The plan RPC remains the read-only planning contract used before a session
starts.

The plan response contains `requestedTotal`, `plannedNew`, `plannedReview`,
`plannedPractice`, `plannedTotal`, and `plannedAt`. A session snapshot adds the
server-owned `completedActions` and `completionReason` (`completed` or
`exhausted`). `plannedReview` includes due learning and review cards;
`plannedPractice` is currently zero because session membership excludes future
practice. `plannedTotal` equals the three planned component counts.

The server applies the effective modes, list, card filter, source/date filter,
dictionary access, Known Marks, pointer-only exclusion, frozen/hidden state,
and due time. For an active source-bound headword group, ordinary meanings are
introduced in `sense_ordinal` order: the first renderable ordinary meaning is
headword-first, while later renderable meanings become new-card eligible at the
next local midnight after an accepted Learn or Known on the preceding ordinary
meaning. A `definition-to-word` direction is recall-only and cannot introduce
an unseen meaning. Idiom-only meanings are outside this exercise family. A
direct `word-to-definition` exercise for a later ordinary meaning is eligible
only when that meaning has an active root example owned by the meaning; a
sparse direct meaning is skipped without blocking the following renderable
meaning. This rule does not mutate learner state: a repaired content projection
makes the exercise eligible again. Existing enrolled/reviewed/Known meanings
are never re-gated by this policy. Each `(entry_id, card_type_id)` is counted
separately. The private `training_scheduler_candidates_v2` relation is the one
canonical candidate implementation. Its retained daily-limit parameter is kept
for RPC compatibility, but candidate selection uses the learner-local 04:00
study day for diagnostics and does not apply a daily quota; finite session size
remains the only session budget. The public direct-selection contract remains
unchanged: a filtered review may include future practice only when its explicit
`p_allow_practice` flag is true.

Direct-selector compatibility remains part of this contract: due
review/learning order is preserved, while new and practice selection keeps the
existing random-mode-then-random-card policy. Selector diagnostics
(`new_pool_size`, `learning_due_count`, `review_pool_size`, and mode-set-wide
`new_today`) remain present; `new_today` is attributed to the learner-local
04:00 study day and is informational rather than a quota. The
`daily_new_limit` compatibility field may still be returned for cached
clients, but it no longer gates selection.

Presentation order inside the selected new/practice work remains random on
every call and is not a global deterministic queue policy. A session latches
its finite membership once and does not apply a daily cap.

Session start may carry the browser-resolved IANA timezone in
`p_training_filter.timezone` so the existing trigger can initialize/update the
learner preference. Date-window and study-day boundaries use the stored learner
timezone; the request hint is not a competing scheduler boundary. The stored
zone is captured for the next-local-day introduction rule, and the resulting
availability instant is immutable, including across a later timezone change or
DST transition. Legacy callers without a timezone use `UTC`.

Session lifecycle:

- request one plan when a session starts for the exact modes/list/filter scope
  and publish it only as an atomic `(session generation, scope key, plan)`
  snapshot; stale responses from an earlier generation or scope are rejected;
- latch the requested action budget and membership for the session; later
  counter refreshes must not reduce either;
- only an accepted Learn, Known, or review-grade action advances
  `completedActions`; retries, hints, answer reveal, unavailable-card handling,
  and replacement do not;
- selection retries, skipped/unrenderable candidates, and exhaustion do not
  create a new plan; an unavailable member may receive one eligible
  replacement, otherwise the server records `completionReason: exhausted`;
- a session restart or exact scope/filter/modes change requests a new snapshot;
- if the RPC is unavailable or returns an invalid contract, show the
  authoritative ordinal only and omit ratio/progress UI.
