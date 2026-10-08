# Issue 623 validation

Validated against the dedicated issue worktree and local Supabase, contract 220.
No production learner identifier is included in this evidence.

- Disposable SQL suite: 356 passing tests in 40 files. Includes original Known
  sibling enrollment, reference clock, preservation of rated sibling state,
  independent/historical paired Known, exact meaning exclusion, atomic resume
  with Known + exclusion, duplicate receipts, stale revision rejection and grants.
- Full UI suite: 2,115 passed; 344 database-dependent tests skipped in the
  unconfigured UI run. The disposable SQL suite above covers those contracts.
- Targeted new API/read model and History tests: passed.
- Typecheck: passed. Lint: existing handlePlayAudio dependency warning only.
- Production build passed using the local wrapper environment. The initial
  unconfigured build had no Supabase configuration.
- Real Chrome Nikolai / local dev login: one Learn enabled both directions;
  Known direct displayed Partly known with reverse awaiting its first rating;
  atomic resume removed the mark and retained familiarity; a real Good rating
  populated Stability/Difficulty while reverse remained ungraded.

The existing Statistics screen and Recent Activity panel are retained. History
rows navigate by Entry ID rather than approximate headword matching. Progress
uses existing modal/theming primitives, not prototype global CSS.

Responsive/layout/gesture verification and rollout evidence are completed below
as the release checks finish. Screenshots are local QA artifacts and may include
only the deterministic local dictionary fixture.

Responsive QA: 320×780 and 1280×900 in the existing Chrome profile. The mobile
handle cycles heights, follows a drag, snaps, dismisses below minimum and
reopens at medium height. The underlying Library sheet retains its size.
Backdrop blur is 1 px. Desktop and mobile screenshots show the real local UI.
Library exclusion and direct Resume were also exercised with the local fixture.
Targeted final UI regression checks: 87 tests passed.
History browser QA: the existing Statistics → Recent activity panel retains
its grade/date rows; clicking huis opened its exact Entry in Library and the
status opened current progress. Final undo-notification checks: 20 passed.

Final contract recovery/checkpoint: the unreleased 218 guard was aligned with
CI's auth call pattern, its exact checksum updated, and 219/220 bootstrap paths
made canonical. Disposable SQL remained 356/356. The local DB was backed up,
recreated from baseline 122, and advanced through the real managed gate to 220
(readiness 23 ms); original Auth/application data was restored from backup
without replacing the new genuine deployment receipts. Read-only check passed:
50 entries, 4 learner states and 1 historical review retained. No production DB
was accessed by these checks. Initial CI also caught an obsolete 214/#407
assertion in the standalone deployment-gate tests; it now asserts 220/#623.
