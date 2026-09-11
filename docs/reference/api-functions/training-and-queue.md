# API Functions: Training And Queue

## Authentication

Use authenticated Supabase clients:

```javascript
const { data, error } = await supabase.rpc('function_name', { params });
```

Functions in this group validate that `p_user_id` matches `auth.uid()`.

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
all-due-today session cannot silently grow with future practice cards. The old
eight-argument compatibility overload was removed by migration `137` after
all application, test, benchmark, and deployment callers moved to this
explicit contract.

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
seventh argument. It accepts `5`, `10`, or `all-due-today`; finite values cap
the unique new/due card targets, while `all-due-today` includes today's new
budget plus due learning/review work and excludes future practice. FSRS
calculations and review intervals are unchanged. The current Training pilot
uses this overload and stops after the planned number of accepted cards.
For finite sizes, `plannedTotal` is the authoritative stopping value; the
`plannedNew`/`plannedReview` fields describe the bounded pool rather than a
promise that the scheduler will present all new cards before all reviews.
Finite sessions now create a server-owned membership snapshot through
`start_training_session`; subsequent reads use `get_next_training_session_card`
and accepted actions consume that snapshot atomically. The plan RPC remains the
read-only planning contract used before a session starts.

The response contains `plannedNew`, `plannedReview`, `plannedPractice`,
`plannedTotal`, and `plannedAt`. `plannedReview` includes due learning and
review cards; `plannedPractice` includes reachable future-due practice cards.
`plannedTotal` always equals all three component counts. The server
applies the effective modes, list, card filter, source/date filter, dictionary
access, Known Marks, pointer-only exclusion, frozen/hidden state, due time, and
the scheduler's cap/fallback rules. Each `(entry_id, card_type_id)` is counted
separately. Selection wrappers and planning both use the private
`training_scheduler_candidates_v1` relation, which owns cap/fallback
cardinality and queue ordering. The public selectors take their next identity
directly from that relation; the plan counts the same relation. This avoids a
second scheduler or a post-selection rejection path.

Scheduler compatibility remains part of this contract: due review/learning
order is preserved, while new and practice selection keeps the existing
random-mode-then-random-card policy. The daily-new cap is measured in distinct
words, so additional unseen modes for a word introduced today do not consume a
second word slot. Selector diagnostics (`new_pool_size`,
`learning_due_count`, `review_pool_size`, and mode-set-wide `new_today`) remain
present with their established meanings.

When the remaining new-word cap is smaller than the candidate pool, cohort
membership is stable for the authenticated user and exact modes/list/card/filter
scope. Plan and subsequent selectors therefore cannot independently choose
words with different eligible-mode cardinalities. This seed controls only cap
cohort membership; presentation order inside the selected new/practice work
remains random on every call and is not a global deterministic queue policy.

Session lifecycle:

- request one plan when a session starts for the exact modes/list/filter scope
  and publish it only as an atomic `(session generation, scope key, plan)`
  snapshot; stale responses from an earlier generation or scope are rejected;
- latch that accepted total for the session; later counter refreshes must not
  reduce it;
- selection retries, skipped/unrenderable candidates, and exhaustion do not
  create a new plan;
- a session restart or exact scope/filter/modes change requests a new snapshot;
- if the RPC is unavailable or returns an invalid contract, show the
  authoritative ordinal only and omit ratio/progress UI.
