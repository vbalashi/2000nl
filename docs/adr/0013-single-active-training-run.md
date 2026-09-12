# One active Training run per learner

Status: accepted by owner, 2026-09-12; implementation pending #393.

Only one first-party Training run may be active per authenticated learner across
devices, tabs, languages and exercise families. Server authority identifies that
run. Starting another supersedes it; superseded queues must not accept new
answers. This prevents a stale phone queue from grading exercises already
answered on a computer. Durable FSRS, Known, enrollment and history remain
independent of queue lifetime.

## Queue storage is not ownership

Existing ordinary server queues may remain. Exact cross-device queue transfer
is not required. Idiom and translation consumers may use temporary queues but
must obey the same active-run authority. Do not remove ordinary tables or
learning history merely to make queue storage uniform. No daily cap or new
arbitrary session TTL follows from this decision.

This supersedes the temporary-only direction in the unmerged ADR0012 draft on
codex/332-idiom-session-runtime (eaf3eedce), and qualifies ADR0005's navigation
lifetime: preservation only applies while the run remains current. The rejected
migration153 prototype is not approved for rollout by this decision. ADR0012's
number is reserved for that historical draft; do not merge its runtime wholesale.

## Reset and continue

Before interaction after load, return/focus, reconnect or BFCache restore,
validate ownership with the old face hidden/disabled. A superseded run discards
its queue and local presentation state. On deliberate continuation here, start
a new run and rebuild from current progress using still-permitted settings at
0/N, without an additional confirmation dialog or a promise of the old order.

Background notifications and validation callbacks invalidate only; they never
claim ownership. Use the existing start/continue interaction to distinguish
deliberate continuation from passive focus. Otherwise two visible tabs could
continually replace each other's runs. No connection means no grading until
validation succeeds. Final new layout/copy remains subject to visual approval.

## Atomic safety

Takeover and action persistence serialize at a common server boundary. An old
action committed before takeover remains valid and is visible to the new queue;
an unaccepted action after takeover has no effects. An exact retry of a committed
action returns its receipt even after takeover, without another grade or a new
run counter increment. Unaccepted old answers are never replayed onto new runs.
Late asynchronous results cannot populate a newer run. Notifications reduce
latency but cannot guarantee instantaneous cross-device invalidation; the server
check is the final guard, not the normal learner-facing flow.

Connected Client auth and non-training dictionary actions are not superseded by
starting Training. First-party old-client compatibility must not leave a bypass.

## Delivery

Authoritative status/dependencies: #327, #392, #393, #394. Keep #331 as the scoped
exercise-selection visual gate, #195 as content policy, #332 as idiom consumer
and legacy-state preservation, and #333 as translation consumer. See the
[implementation handoff](../exec-plans/active/issue-392-single-active-training-handoff.md).
