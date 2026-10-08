# Defer the pilot overview's automatic detailed statistics

The post-PR620 trace showed a detailed statistics read starting343ms before
Start and overlapping first-card acquisition. Source audit locates that read in
TrainingScreen's automatic scope/bootstrap effect. Pilot Today uses separate
availability data for its visible counts and Start eligibility; detailed
statistics primarily feed the session footer and its fixed review baseline.

This slice prevents that automatic read while pilot Today/setup is visible and
until a session's card preparation is ready. Legacy Training keeps eager
statistics. The existing Start refresh after loadWord settlement, explicit
list-edit/scope refreshes, accepted-answer refreshes and retries remain intact.
It does not guarantee every statistics read starts after a visible DOM frame,
nor does it cancel any query already executing on the database.

The initial-statistics marker moves from the automatic effect to actual request
creation. The first originating read owns it; joining a pending same-scope read
must not consume it again. Otherwise Start could initialize the fixed baseline
but leave the marker set, allowing a later scope change to overwrite that
baseline. A failed/stale initial request still leaves the existing null-baseline
fallback available for the next successful current response. A functional state
update also preserves the first successful current baseline if scope B resolves
first and the earlier scope A request is later adopted and completes; captured
state from A cannot overwrite B's established baseline.

Scope-key pending-request reuse and account/scope/generation fences are retained.
No SQL, scheduler, session idempotency, learner state or database contract changes.
Availability's existing statistics refresh key remains, so results can still
refresh Today after a session. Idiom/sentence Start refreshes are unchanged.

Validation must cover no automatic pre-Start read, eventual scoped statistics,
legacy eager behavior, restored-session readiness, fixed baseline across scope
changes, error recovery and pending adoption. Browser characterization first
failed with one detailed-statistics request before Start. The revised scenario
asserts zero in desktop/mobile Today, then one post-Start read held10s while the
first card is usable, with no answers/reviews and no duplicate request.

No production speedup is claimed by request suppression alone. #413 remains
open for the SQL first-call/tail diagnosis; this is a separately reviewable
reduction of unnecessary frontend work.

Local validation:82/82 TrainingScreen tests, UI typecheck and focused lint pass.
Three browser setup-readiness scenarios pass; the pre-Start assertion first
failed with one speculative read. Exact A/B adoption keeps baseline9 after
late A due5; pilot first Start baseline7 survives the next scope due15;
a failed initial read still permits the next success to initialize baseline7.
Independent code review found no remaining blocker.
