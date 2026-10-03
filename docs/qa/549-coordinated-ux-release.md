# Coordinated UX release #549 / plan #533

Status: integration in progress, not released. Baseline: `28e4ea42`.
Live tracking: https://github.com/vbalashi/2000nl/issues/533.

## Acceptance evidence and remaining gates

| Requirement | Current evidence | Remaining release evidence |
|---|---|---|
| First Library page / first 50 rows | #536 bounded retry and preload/cache tests; #544 SQL parity/security tests and exact contract196 probes | Exact deployed SHA/contract; limited production first-page timing and failure/retry smoke |
| Retain Library and Activity on return | #536 warm-return tests; #538 retained reads with cancellation/owner boundaries; combined browser tests | Final integrated browser pass |
| No Preparing Training flash | #548 controlled reproduction 10/10 before, 0/10 after | Final build navigation smoke |
| Inline Library grading / truthful status | #542 direct-only action, accepted-write refresh locking, serialized mutations; exact directional last grade, FSRS review count and next due; combined projection/Library tests | Final integrated browser presentation and API smoke |
| Preserve consumed answers, replan only remainder | #547 independently reviewed SQL/client; four grades, duplicates, Again, Known/Undo, unavailable rows, concurrency/takeover and client retry/generation tests; included in fresh combined SQL suite; full contract200 probes | Final runtime smoke |
| One contextual Translation | #537 builder/presentation/tests; actual reverse four-grade SQL identity checks; saved recipe roundtrip; owned NL/EN legacy sentence resume with no new start and wrong-account rejection | Final runtime smoke; orchestration tests stub sentence presentation/transport |
| Both idiom directions | #529 real mixed membership and edge-case SQL tests; combined UI tests; migration198 included in exact manifest200 | Final runtime smoke |
| Free-height mobile sheet | #546 pointer/keyboard tests; final real UI mouse/touch, resize, Home/End/Arrow, cancellation/lost capture, inner scroll at390/610 | Native iOS notch inset was not tested; Chromium safe-area is0 |
| Typography and spacing | #534 audit a4a1475b; #561 both account-persisted profiles, default Balanced; real DB/RLS/replay;288 RU geometry cases across4 sizes,3 containers,off/on/partial,Indigo light/dark;16 keyboard checks | Native browser zoom not proved by headless capture; production visual smoke |
| Historical Indigo | #551 source match, contrast/settings/DB persistence tests, independent review; integrated profile geometry uses Indigo light/dark | Production visual smoke |

## Integration checks already run

On the combined code with idioms and Indigo: typecheck and 100 focused tests passed
(builder, setup commit, idiom client, themes and appearance persistence).
After integrating Library optimization196: typecheck and 15 Library service/API
tests passed. These do not replace SQL or final full-CI checks.

After integrating197 and inline grades, a fresh disposable database passed all
304 SQL/FSRS tests across32 files. Combined typecheck and105 focused Library,
projection and selection tests passed. The saved setup/resume suite passed153
tests across5 files, including actual TrainingScreen orchestration for an owned
legacy sentence session on NL/EN and rejection of a foreign account record.
Its transport and sentence presentation are stubbed, so this is not a claim of
production browser/DB integration. Manifest199 validates with exact checksums.

Final contract200 build:305 SQL/FSRS tests across33 files passed in a newly created
and removed disposable DB;83 TrainingScreen/spacing/readiness tests passed;
typecheck/lint passed (existing unrelated handlePlayAudio dependency warning).
The19 deployment-gate tests passed. On isolated official digest-pinned PG17,
production-shaped pre-switch checks passed3/3, and a fresh second scoped DB passed
apply/replay followed by both complete postflight200 chains. Ledger123–200 has78
entries and exact checksums. Baseline/compatibility evidence is separate from the
SQL grading tests; empty pre-switch learner fixtures alone do not prove grading.

Final browser QA tested production code at `f64b2eaa`:13 approved-interface cases
(combined UX, sheet edges,7 bootstrap profiles and attribution) and8 legacy bootstrap
cases passed. Test-only `f2722aaa` adapts assertions to the approved minimal logo
shell while preserving localized headings, full viewport, gate continuity and
legacy header/spinner geometry. Transports are mocked; this is browser behavior
evidence, not production latency or a live API grade. Temporary3106 was stopped.

The bootstrap CI failure was reproduced with the approved flag disabled: the
remaining localized loading text belonged to the retained hidden History section.
Commit `cc458eb7` checks visible loaders while preserving shell/heading/geometry
assertions; all seven profiles passed, one geometry case after a retry. No runtime
code was changed for this test correction.

Local warm SQL improvement is not production latency. No production grades,
database reset, migration, or deployment was performed during this integration.

## Rollout

Register reviewed migrations196–200 contiguously with exact checksums and chained
probes. Do not declare Release-Ready until all runtime dependencies and required
checks are present. Merge the coherent integration PR once ready, confirm immutable
runtime SHA and deep DB health, then perform bounded production reads and owner QA.
The owner selected both typography profiles on2026-10-03. #561 implements Balanced
as default and Airy selectable independently from size/palette; migration200 stores
only that preference. Final exact-head CI, immutable deployment health and bounded
production read/visual checks remain before completion.
