# Coordinated UX release #549 / plan #533

Status: integration in progress, not released. Baseline: `28e4ea42`.
Live tracking: https://github.com/vbalashi/2000nl/issues/533.

## Acceptance evidence and remaining gates

| Requirement | Current evidence | Remaining release evidence |
|---|---|---|
| First Library page / first 50 rows | #536 bounded retry and preload/cache tests; #544 SQL parity/security tests and exact contract196 probes | Exact deployed SHA/contract; limited production first-page timing and failure/retry smoke |
| Retain Library and Activity on return | #536 warm-return tests; #538 retained reads with cancellation/owner boundaries; combined browser tests | Final integrated browser pass |
| No Preparing Training flash | #548 controlled reproduction 10/10 before, 0/10 after | Final build navigation smoke |
| Inline Library grading / truthful status | #542 direct-only action, accepted-write refresh locking, serialized mutations; updated TrainingScreen tests | Last-grade/due display completion; migration197 and integrated grade/replan verification |
| Preserve consumed answers, replan only remainder | #547 dedicated SQL tests in progress | Independent review, client reconciliation, contract197, combined SQL/UI checks |
| One contextual Translation | #537 builder/presentation/tests; legacy sentence starts paused without converting progress | Integrated four-grade SQL identity evidence and saved/resumed setup behavior |
| Both idiom directions | #529 real mixed membership and edge-case SQL tests; combined UI tests | Migration198 in contiguous manifest, combined DB/browser pass |
| Free-height mobile sheet | #546 pointer/keyboard tests and combined real UI mouse/touch drag | Final viewport/keyboard/cancellation smoke |
| Typography and spacing | #534 rich fixtures/measurements/candidate screenshots; independent review identified conditional-spacing and Russian-comparison gaps | Corrected audit artifacts, owner selection, production implementation and final visual checks |
| Historical Indigo | #551 source match, contrast/settings tests, independent review | Contract199 integration and final persistence/browser smoke |

## Integration checks already run

On the combined code with idioms and Indigo: typecheck and 100 focused tests passed
(builder, setup commit, idiom client, themes and appearance persistence).
After integrating Library optimization196: typecheck and 15 Library service/API
tests passed. These do not replace SQL or final full-CI checks.

The bootstrap CI failure was reproduced with the approved flag disabled: the
remaining localized loading text belonged to the retained hidden History section.
Commit `cc458eb7` checks visible loaders while preserving shell/heading/geometry
assertions; all seven profiles passed, one geometry case after a retry. No runtime
code was changed for this test correction.

Local warm SQL improvement is not production latency. No production grades,
database reset, migration, or deployment was performed during this integration.

## Rollout

Register reviewed migrations196–199 contiguously with exact checksums and chained
probes. Do not declare Release-Ready until all runtime dependencies and required
checks are present. Merge the coherent integration PR once ready, confirm immutable
runtime SHA and deep DB health, then perform bounded production reads and owner QA.
Typography remains pending the owner's variant selection and must not be silently
marked complete with the rest of the release.
