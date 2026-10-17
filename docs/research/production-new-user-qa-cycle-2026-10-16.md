# Production new-user QA cycle — 2026-10-16

Status: completed exploratory cycle; defects remain open. Owner: issue #710.
Production: https://2000.dilum.io/
Baseline build: 0.18.1311 / 7f9db8862a33d0d4152ad5d310f80d112e7622cd.
Identity: fresh, dedicated QA account; personal/reference accounts excluded.

## Coverage

Fresh startup; default training; Library search; two manual collections;
add/remove/re-add distinct meanings; persisted memberships; empty source;
training create/save/edit/load/delete; Words/Idioms/Translation; reveal/Learn/Good;
exit/resume/reload; statistics; interface language; mobile navigation, progress
and search filters. Viewports: 1280×577, controlled desktop 1280×900,
mobile 390×844 and 320×740. This is one fresh-account journey, not exhaustive
coverage of every setting, account/billing flow, exercise variation or network failure.

## Findings

Automation targeting errors are recorded separately from
verified product defects. Network evidence excludes credentials, headers,
request/response bodies and user identifiers. DOM observations track dialog,
busy/alert, and control changes rather than relying on frame video.

## Scenario log

### Observation 1 — session start failed while a paused session exists

After starting default training, revealing/learning one meaning, closing it,
and opening Create training, an automation ref intended for a source option
actually dispatched Start training (captured native click label). This targeting
mismatch is excluded as a product defect. The genuinely dispatched Start then
called `start_training_session`, returned HTTP 500 after 9040 ms, and returned to
Training home with a preparation failure message and Retry card preparation.
Screenshot: `builder-starting.png` in retained cycle evidence. A later controlled Translation transition also returned 500; a repeat succeeded. See final findings below. No response body was retained.

### Observation 2 — no explanation for zero eligible exercises

Created a second collection, removed its sole meaning, saved a training using
it and loaded the saved training. Home showed Due now 0 / Total reviews 0 /
Still new 0 and Edit training, with no explanation or add-words action.
The same home state appeared after starting Translation on the two-meaning
collection: `start_training_session` returned 200 (1697 ms), availability 200,
then no session and no explanatory notice. This is a reproducible UX gap,
not evidence of missing membership. Screenshot: `no-translation-targets.png` in retained cycle evidence.

### Observation 3 — completed short session keeps requested denominator

Word training of the two-meaning collection displayed both `goed` and `fiets`;
Learn on each succeeded, then Session complete / 2 cards / 0 min 25 sec appeared
beside the header `2 / 10` and Another 10 cards. The session exhausted honestly,
but the fixed requested denominator conflicts with the completion message.
This is a presentation finding; repeat confirmation pending.

### Observation 4 — synthetic test sources visible to a new account

The builder Source menu includes `Wiktionary-like NL Test (synthetic)` under
Dictionaries and `Wiktionary-like NL Test` under Collections. Observed on two
separate builder openings. Verify whether these are intentionally published;
the UI exposes test terminology to ordinary new users.

### Passed so far

- Fresh default: 2333 new, no startup error; Start/reveal/Learn works.
- Created Book 1 QA710 with fiets; added one goed adjective meaning. Picker 2 items.
- Created second collection, removed its sole meaning; empty state reflected.
- Saved training PUT 200; edited source/mode PUT 200; loaded saved setup.
- Words/Idioms/Translation selections update summary when target is in viewport.
- Collection Words session showed only goed/fiets and completed after two Learn actions.
- Started Direct + Reverse after enrollment, revealed Again/Hard/Good/Easy, submitted Good, progressed.
- Reload restored active session on the next card; no repeated first Learn required.

### Automation limits

Agent-browser click may return Done without a native click for an offscreen or
covered control, or hit sticky Start instead. Every questionable click was
checked against the in-page click label and screenshots. Modal Save must use
the modal ref: unscoped semantic matching can hit the background Save control.
These failures are excluded from product findings. The first viewport was
1280x577; the controlled subsequent pass used 1280x900.


## Final findings and issues

| Tracking | Priority | Evidence and limit |
| --- | --- | --- |
| [#711](https://github.com/vbalashi/2000nl/issues/711) | High | Two actual `start_training_session` 500 responses: 9040 ms for inherited Words with paused session, 8727 ms for full-dictionary Translation after paused Idioms. Second returned to old Idioms home with no visible error. Controlled Translation repeat returned 200 in 4251 ms and worked. Intermittent/context-dependent; root cause unknown. |
| [#702](https://github.com/vbalashi/2000nl/issues/702#issuecomment-6221166296) | Medium | Successful collection mutations cause repeated disabled/enabled states and focus loss. Dialog stays mounted/opacity 1. Correlated trace below; React cause unknown. |
| [#712](https://github.com/vbalashi/2000nl/issues/712) | Medium | Empty collection or zero eligible Translation targets yields zero counters / Edit-only home with no reason or next action. Observed on two routes. |
| [#713](https://github.com/vbalashi/2000nl/issues/713) | Review | New account sees synthetic test dictionary/list; publication intent needs verification. No private-data exposure claimed. |
| [#714](https://github.com/vbalashi/2000nl/issues/714) | Low | Short complete session shows 2/10 beside Session complete / 2 cards. Full AX state captured; completed-screen screenshot and repeat visual confirmation missing. |

Minor copy observation: Russian picker labels `1 элементов` and `2 элементов`
use the same plural form; should be checked with Russian pluralization. The
fresh settings enabled German/English/French/Dutch before user selection; this
is recorded as a default to review, not a confirmed requirement violation.
The initial VanDale2k setup is not automatically in Saved Trainings; switching
active training leaves it absent from that section. Saved named trainings
persisted together until an explicit delete, so no saved-data loss was observed.

## Network and DOM correlation for collection changes

On mobile 390×844, opened fiets Collections, removed Book1 membership, then
re-added it. Same performance time origin after reload, dialog node ID 1:

| Time (ms) | Network | Dialog state |
| --- | --- | --- |
| 177485 | remove starts 177488, 204 at 177586 | disabled controls 0→3; focusInside true→false; remains open/opacity 1 |
| 177589–177691 | membership 200 | controls enabled 177694 |
| 177695 | two list reads 117 ms/3981 ms | same dialog remains |
| 180084–181631 | lookup 200; membership 181636–181736 | disabled 181635, enabled 181739 |
| 182454–182652 | re-add 204; membership 182656–182830 | disabled 182448, enabled 182833 |
| 182926–183275 | refresh membership 200 | another disabled/enabled cycle |
| 183644–183784 | refresh membership 200 | another disabled/enabled cycle |
| 184919–187484 | further search/lookup/membership refresh | another disabled/enabled cycle; focus not restored |

After the first Create (74691 ms, next button action 94477 ms), 14 fetch starts
were recorded: create/add2, memberships3, wordlists2, next-session-card2,
active scope 1, summary 1, detailed stats 1, search 1, lookup 1. This is a candidate
for broad refresh work, not proof all requests are unnecessary.

Fetch/XHR wrapper can miss client-cached fetch references after reload. Phase2
therefore also uses PerformanceObserver resource entries (paths only), and the
browser network list independently confirms status codes. Resource/fetch
records may describe the same request and must not be added together. The first
DOM observer counted role dialogs only and missed native dialog elements;
the focused observer uses `dialog[open],[role=dialog]` and node identity. React
render start/stop returned Done without a component profile; no claim of React
commit attribution is made. No frame recording was used to diagnose flashing.

## Additional completed checks

- Idioms: full dictionary start, reveal, Good, next card, pause and new launch worked.
- Translation: full dictionary repeat after 500 started an English context prompt
  for enrolled politiek, revealed Dutch answer and accepted Good, completing.
- Mobile Collections: Book1 had 2 meanings after reload; Empty had 0. Remove/re-add
  updated 1→2 and checked state correctly.
- Mobile learning progress loads both independent directions.
- Mobile Library filters applied Verbs to query fiets and returned fietsen;
  reset worked. No horizontal layout break was observed in captured 320px screen.
- Statistics displayed 5 new exercises, 0 reviews, 1 active day after the initial
  actions. No page errors were reported by browser errors command.
- English→Russian interface change persisted after final reload.
- Both named trainings survived reload; explicit delete of Idioms used confirmation
  and removed only that preset, preserving the other.
- about:blank navigation was not reproduced during this cycle.

## Evidence preservation

Ignored canonical directory:
`tmp/agent-browser/issue-710-evidence/new-user-cycle-2026-10-16/`.
Contains 815 phase1 events, 661 phase2 events, screenshots and SHA256 manifest.
Both JSON arrays validated against a fixed field allowlist; no headers, bodies,
query strings, tokens, auth user IDs or QA email values persisted. Screen content
is dedicated QA data/public dictionary material. Request durations are browser
observations, not calibrated server performance measurements.

## Remaining scope

The cycle does not establish flawless behavior. Retry behavior, 500 server causes,
keyboard focus restoration, empty-state guidance and test-source publication
remain actionable. No fix, merge or production deployment was performed in this
QA-only cycle. Billing/payment, destructive account operations, cross-device
sessions, full keyboard-only journey, all grades and all filter combinations
were not exercised. Report/feedback submit was not sent.

## Cleanup

Official wrapper exited 0 after `REVOKE`. Server-side session revocation succeeded; temporary secret env, wrapper/probe helpers, token artifacts, isolated profiles and exact browser sessions/processes were removed. Fresh QA identity and labeled collection data remain for reproducibility. Personal/reference users were untouched.
