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

Final performance boundary review: the batch progress read is limited to
first-party dictionary-lookup intent. Training review and connected-client
lookups keep their existing reads; paired route tests assert that distinction.
Dark theme was verified in real Chrome at 1280×900 with 1 px backdrop blur;
temporary viewport/media overrides and the 3101 process were removed.

Final narrow-screen CI regression: the localized meaning-exclusion label now
wraps within the existing quiet-action component at Extra text size. All six
language/theme Report checks passed at 320/844 px. Shared drawer geometry is
measured in one animation frame, preserving the exact spacing assertions;
all 36 existing Details checks passed across screen/text/theme combinations.
Typecheck and lint passed (the existing audio-effect dependency warning remains).

Owner screenshot review caught an outdated SettingsPrototype demonstration
route (not an application regression): the approved SettingsDestination,
Appearance/TextSize components, theme and navigation are unchanged from the
running production commit 94039290. The owner's actual Chrome Settings page
was used as the reference, including computed Inter typography. Canonical
3100 now serves the real feature application rather than the old demo route;
the retired 4188 mock entry redirects to that actual application. The local
QA Auth refresh-token sequence was advanced to its restored row maximum after
an OTP mint exposed a backup-restore sequence mismatch; no user rows were edited.

Pilot gesture browser expectations now test the agreed shared behavior:
Home reaches compact, clicks cycle compact/medium/max, live mouse/touch motion
follows the pointer and release snaps. Cancellation/capture loss still restores
the previous height. All five real-navigation pilot checks passed locally.


## Verified release

[PR 625](https://github.com/vbalashi/2000nl/pull/625) merged as
`631e209354121df7d5489130b02c2e02fcb17f2e`.
[Final CI](https://github.com/vbalashi/2000nl/actions/runs/37812042114) passed:
2,116 UI checks (344 DB-dependent checks skipped here and covered separately),
180 API checks, 184 ordinary browser checks, 25 pilot browser checks and 17
training-reliability checks. Two existing mobile Report cases passed on retry;
three configured ordinary browser cases were skipped. Disposable SQL: 356 passed.

[Deployment](https://github.com/vbalashi/2000nl/actions/runs/37814176682) succeeded.
Independent exact-commit health verification confirmed version `0.18.1200`,
commit `631e209354121df7d5489130b02c2e02fcb17f2e`, health `ok`, and
expected/actual `2000nl-db-220`, migration 220, compatible true.
Reference main was synchronized to that commit and canonical local 3100 health
confirmed the same code/contract.

`current-appearance.png` and `current-progress.png` show the actual local
application using its test account/data and the current production component
families (Inter, Larger text, Indigo). They replace the outdated SettingsPrototype
route as the visual reference; no production learner data is included.
