# #407 measured active study time

Status: measurement foundation and server duration storage/read API implemented.
Card-owner/browser delivery integration is now wired behind the approved Training
presentation flag. Real-browser persistence/attention acceptance and the full
Statistics read model remain pending; unit tests are not proof of live collection.

## Approved meaning

The owner approved measuring active time on a training card, excluding background,
loading, History and Settings. Store a distinct measured duration. Do not derive
minutes from review counts, transition diagnostics or session start/end wall time.
Face and revealed answer are one card presentation; revealing does not reset time.
The measure is attention on an available card, not proof of successful learning.

## Ownership and clock

- `lib/training/activeStudyClock.ts`: monotonic elapsed-time arithmetic, with no
  dependencies on FSRS, lookup, mutations, account settings or calendar rendering.
- `components/training/useActiveStudyTime.ts`: browser attention/lifecycle adapter.
  A caller supplies a prepared owned session/card identity and eligibility.
- The ordinary, idiom and sentence session owners must supply eligibility only
  after their actual content is ready. Loading, pending action recovery, submission,
  terminal states, navigation and application overlays disable it. The Training
  screen owns global drawer/history/settings/hotkeys eligibility; card-local
  report/exclusion dialogs must also pause it. Do not infer readiness from the
  existence of an entry ID alone.
- Visibility plus window focus gates attention. `pagehide` flushes/stops it;
  `pageshow` rechecks attention. Scope/account/card replacement and unmount flush
  the previous identity before removing its listeners/timer.
- Checkpoints run every 15 seconds. Unknown gaps over 30 seconds are discarded,
  preventing browser/OS suspension from becoming hours of apparent study. This
  deliberately conservative measurement may undercount during long main-thread
  stalls. No timer updates React display state every second.
- Durations retain milliseconds, with rounding only at the integer transport
  boundary and at the final human-readable display. Never round each slice into
  minutes. Identity includes the local principal guard as well as owned session,
  exercise family and card key; a later principal cannot relabel an earlier slice.

## Next storage boundary

Create a dedicated measured-duration store/read model, separate from review/action
history and scheduling state. Reuse the authenticated first-party API boundary.
Principal identity must be server-derived, and session membership/ownership must
be validated for ordinary, idiom and sentence cards. Do not trust a client-supplied
language, dictionary, user ID or study-day label; derive scope from the saved
session/member and the existing learner timezone/04:00 study-day authority.

Use bounded, immutable measurement IDs with idempotent retries; one transport
retry must not add the same milliseconds again. The client queue must reject a
principal mismatch, remain bounded, and not block reveal/grade/next on telemetry
failure. Keepalive delivery on exit is best effort, not a guarantee that every
millisecond survives a crash. Define attribution for buffered intervals spanning
a study-day boundary before exposing per-day totals. Do not store raw card text,
translations, browsing paths or report content in a duration record.

An additive SQL migration must include explicit grants/RLS, session/family/member
validation, integer bounds, duplicate/conflicting replay checks and aggregation
indexes. Extend the exact checked-in deployment manifest and postflight/read-only
probes. Apply locally through the retaining harness; never reset the populated
local dictionary or bypass a rollout hold. Validate SQL owner isolation and replay
behavior in a disposable database before connecting the browser.

## Statistics acceptance

Use recorded intervals and the canonical historical learning events, not the
prototype's seeded calendar or its minutes formula. Treat absence of measurement
support as unavailable, not a fabricated zero. Define the history coverage start
so unmeasured pre-rollout days are distinguishable from measured zero activity.
EN/NL/RU, all account text scales and light/dark themes share presentation tokens.
The approved screen needs real day/week/month/calendar/highlight/material scope
read models, explicit loading/error/empty states and a working training launch.

## Evidence for the foundation

Clock and hook tests cover counted vs paused time, heartbeat partitioning,
fractional checkpoints, missed-heartbeat suspension, invalid/backward clocks,
background/window attention, loading/overlay eligibility, candidate replacement,
account replacement, pagehide/pageshow, StrictMode/reveal rerenders and cleanup.
These tests verify the measurement building block. They do not prove durable
storage or correct eligibility integration in the actual Training components.


## Server storage checkpoint — 2026-09-30

Migration 187 creates private, RLS-enabled attention receipts and an immutable
coverage-start record. Browser roles and service_role have no direct table access;
authenticated RPCs derive the principal from auth.uid(). The first-party API rejects
connected-client access, oversized/extra metadata, malformed identity and duration,
and never accepts a client user ID, language/material ID or study-day label.

The writer validates owned saved session membership for ordinary entry/direction
and for idiom/sentence target registry identities. Scope comes from the member's
entry. Recording duration does not mutate Learn/review history, card state, FSRS or
session progress. Completed/expired membership stays valid for a final buffered
measurement; new receipts must be within 24 hours, no more than one minute in the
future, and cannot start before the session (with one-minute clock-skew tolerance).
Expired transport retries of an already accepted immutable ID still return the
same acceptance without adding time; a different payload conflicts. One principal's
writes are serialized by a transaction advisory lock. Receipt identity survives
session read-model cleanup and contains no raw card/translation/report text.

Each receipt is a continuous interval ending at observedAt, bounded to 30 seconds.
The read API bounds its calendar span to 366 days, derives the persisted learner
timezone, and splits intervals across each local 04:00 boundary, including DST via
local timestamp conversion. It returns coverageStartedAt so the UI can distinguish
pre-measurement history from measured zero. Current API scope is optional language;
material/session selectors and the complete Statistics adapter remain to integrate.
Attention from concurrently active devices is summed; this is measured device
attention, not a claim of deduplicated human activity or a learning outcome.

Validation: 264 SQL/FSRS checks pass in the harness-owned disposable database,
including the five new storage tests for isolation, membership/families, replay,
bounds, local-day splitting and no action/state side effects. The initial run caught
a PostgreSQL LEAST/GREATEST NULL behavior that gave an empty joined day 24 hours;
a FILTER on actual receipt identity fixes it, and isolation/empty-day assertions
now pass. A reserved test query alias was also corrected. The 18 clock/hook/API
checks and 19 managed-deployment runner checks pass; typecheck/lint pass. Checked-in
manifest/probe chains advance to contract 187 with the exact migration checksum.
Retaining local apply and postflight succeeded without resetting dictionary data;
production is not deployed. This does not prove active-card/overlay integration.

Next: bounded principal-guarded client delivery with stable retry IDs, pause gates
in the three real session owners and report/exclusion overlays; then measured-time
and real historical activity integration into the approved Statistics surface.


## Browser delivery and owner integration — 2026-09-30

The ordinary, idiom and sentence session components now call the shared recorder
only with saved session/member identities and prepared content. TrainingScreen
supplies the global surface gate: actual Training destination, no full-word drawer,
History/Settings/hotkeys/language picker, no load or authority check/pending action.
Each card owner additionally excludes lookup/content preparation, submission,
terminal and exclusion/recovery states. Face/answer reveal preserves the identity.
The rollout-off path creates no measurement identity or attention timer.

The browser hook observes actual open native/modal dialogs and menus, covering
card-local report/exclusion surfaces without importing their business state into
the timer. A pagehide latch prevents DOM mutations from resuming attention until
pageshow. Frozen entry/direction/target metadata travels with the old duration on
cleanup, preventing the new card/account from relabeling its predecessor.

The independent delivery queue holds at most 64 receipts per retained account,
checks the live auth principal before each send, keeps the same immutable payload
for up to three attempts, uses an eight-second request timeout and keepalive, and
never awaits delivery from reveal/grade/next. It discards rejected requests, stale
principal queues and exhausted retries. Storage is memory-only; crash/offline/exit
loss remains possible and is not presented as guaranteed accounting. Device time
continues to be an attention estimate, not proof of a learning action.

Validation: 161 checks pass across TrainingScreen, ordinary action/session,
idiom/sentence sessions, attention and delivery, including three new owner readiness/
surface-pause assertions. Three additional wrapper checks prove rollout-off and
content-bound identity behavior; the attention/delivery checks also pass after the
last wrapper guard. Typecheck and shared theme guard pass. New modules lint clean;
the existing ordinary-session handlePlayAudio dependency warning and GoTrueClient/
act test warnings remain visible. Initial repository-relative edit/check commands
were issued from the UI directory and did not edit their intended files; corrected
cwd runs completed the actual changes and validation.

No new SQL/schema or learner action was introduced by this wiring slice. Browser
acceptance must still verify real stored increments, paused intervals and focus/
background transitions against an authenticated local owned session before measured
Statistics is accepted. Next: that real-data attention smoke, followed by full
Statistics history/material/read models and the approved shared presentation.

## Authenticated browser acceptance — 2026-09-30

The first real local smoke exposed a transport mismatch: the receipt delivery
used a same-origin cookie request, but the existing first-party API authenticates
the account bearer token. The visible card was ready and focused, yet POST
`/api/training/study-time` returned 401 and the private measurement table remained
empty. This is a client request defect, not another local schema mismatch.

Delivery now reuses `authenticatedAccountRequest`, which captures the token only
for the expected account and refuses an intervening account switch. The existing
queue guard remains; no cookie-auth workaround or server auth relaxation was
introduced. Two regressions exercise the actual exported delivery function,
including a switch between the queue check and token capture. The prior queue-only
tests could not catch this missing header.

The authenticated local QA account started an ordinary owned session and revealed
its first card without grading, learning, excluding or sending a report. The store
changed from zero receipts to real positive measurements. Opening History settled
the previous interval at 116,322 ms; it remained exactly unchanged for more than
one 15-second sampling cycle. Returning to the card resumed measurements. Opening
the full-word article settled at 159,704 ms and remained unchanged over another
cycle. Opening Report settled at 216,143 ms and also remained unchanged over a
cycle; the form was cancelled without submission. The session was left resumable,
and both agent-created tabs were closed. Evidence: `/tmp/407-active-time-card.png`.

The in-app browser reports `hasFocus() === true` and visible for both tool tabs,
even after an attempted tab activation; its health URL was also blocked by its
browser client. No focus/visibility overrides were installed. Consequently this
smoke proves actual persistence and History/article/report pause-resume, not real
background-tab behavior. Automated focus, visibility and pagehide checks pass;
normal-browser background acceptance and live idiom/sentence duration smokes remain
open. The auxiliary tab was promptly closed; aggregate totals above are pause
checkpoints, not a calibrated duration claim or a user-facing statistic.

Validation: 23 tests across authenticated delivery, delivery queue, attention,
recording wrapper and API; typecheck and targeted lint pass. An initial local
read attempted a connection URI through PGDATABASE and failed; the read was rerun
with explicit validated local connection selection. No reset or schema change.
Next: adapt real measured-time/history read models into Statistics, retaining
explicit coverage and unavailable states and the remaining acceptance gates.

## Measured-time Statistics read/presentation — 2026-09-30

The working Statistics destination now includes the shared `MeasuredStudyTime`
component behind the existing Training presentation flag. It reads only while
Statistics is open, uses an expected-account authenticated request, aborts stale
or timed-out reads and never flashes a previous account/scope result. The existing
current training counters stay separately labelled by study day; the time-period
control does not pretend to filter those counters.

The existing GET supports `period=Today|Week|Month`, alongside its unchanged
explicit date-range mode. It obtains the persisted timezone and measurement
coverage from one bounded authenticated SQL read, derives the current study date
from server time and that timezone, and makes one further bounded read when the
period requires it. A changed timezone/coverage between reads fails closed. No
private-table query, service role, client timezone or schema change is introduced.
Today is the current 04:00 study day; Week means seven study days ending today;
Month starts on the first of the current study calendar month. The response has
explicit dates and an `asOf` instant; the client validates this envelope before
rendering. SQL continues to own duration attribution.

The summary sums recorded milliseconds before formatting whole minutes and shows
`<1 min` for a positive sub-minute total. Errors/loading/pre-coverage periods are
not fabricated zeros. A period intersecting the measurement start explicitly
shows “Measured since …; earlier time is not available.” Coverage classification
is conservative for the first study day, even if tracking began exactly at 04:00.
Language scope is all training in that language across exercise families, not the
current saved setup/material. The exact selected date range is visible. EN/NL/RU
strings share existing catalogs; fonts/colors use account presentation tokens.

Validation: 26 period/API/reader/presentation/catalog checks and 83 existing
TrainingScreen/theme checks pass; three existing Statistics prototype localization
checks also pass. Final date-label presentation checks pass again. Initial
typechecks caught union narrowing in the component and a cleanup callback return
type in a test; both were fixed, and final typecheck, targeted lint and shared style
guard pass. Existing TrainingScreen act/inert/GoTrueClient test warnings remain.

Authenticated local browser acceptance shows 4 minutes for 249,436 stored ms;
Today/Week/Month reads all match the same currently measured data. The store stays
unchanged while Statistics is open. At 320×620, with account Larger text and dark
system appearance, the new section fits a 288 px content width with document width
320 and no horizontal overflow. The temporary viewport was reset and QA tabs were
closed. Screenshots: `/tmp/407-measured-time-mobile.png` and
`/tmp/407-measured-time-statistics.png`. No learner action or preference was changed.

This completes the duration read/display slice, not the full Statistics screen.
Remaining: canonical historical exercise activity, calendar/highlights, material
queue/coverage/read scope and actual launch; replace the legacy statistics layout
and its initial zero/2000 fallback with explicit load/error state. Also retain the
normal-browser background and live idiom/sentence duration acceptance gates.
