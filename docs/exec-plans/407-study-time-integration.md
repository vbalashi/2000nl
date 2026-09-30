# #407 measured active study time

Status: measurement foundation implemented; server persistence, actual card-owner
integration and Statistics read model are still pending. This is not live telemetry.

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
