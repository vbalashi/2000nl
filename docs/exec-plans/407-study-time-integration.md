# #407 measured active study time

Status: measurement foundation and server duration storage/read API implemented.
Actual card-owner integration and the full Statistics read model remain pending.
The browser does not yet send measurements; this is not live telemetry.

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
