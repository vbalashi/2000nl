# Issue 207 exact-group lookup latency evidence

Baseline deployment: production `0.18.430`, commit
`c7e2690fa8708cb35b65216b536134d4637308c4`.

The reproducible benchmark is
`db/scripts/platform_exact_group_latency_benchmark.mjs`. It uses only catalog
discovery and authenticated lookup reads. The isolated
`test@2000nl.test` session is minted in memory and locally revoked in a
`finally` block. Tokens and dictionary content are not written to evidence.

## Baseline command

```bash
node db/scripts/platform_exact_group_latency_benchmark.mjs \
  --batches 10 \
  --samples-per-batch 5 \
  --idle-ms 6000 \
  --warm-spacing-ms 150 \
  --output docs/architecture/evidence/issue-207/route-baseline-c7e2690.jsonl \
  --summary-output docs/architecture/evidence/issue-207/route-baseline-c7e2690-summary.json
```

The run held one exact identity for all 50 requests:

- Dictionary Entry `e4102880-12a8-43f1-a9b1-1b9358c4c289`;
- Headword Group `e4d260dc-0797-4b30-9a26-8720126ed3c6`;
- ten auth-cache-cold samples and forty warm samples;
- every cold sample followed a 6-second pause, exceeding the deployed
  5-second auth-cache TTL, and all ten exposed the expected cold-auth timing;
- the hard total request cap was 55 (five fixed lifecycle requests and no more
  than 50 lookup reads), and each measured HTTP read had a 15-second timeout;
- session revocation recorded as successful.

The final harness also installs the bounded fetch on both Supabase auth
clients. `generateLink`, `verifyOtp`, and `signOut` therefore terminate within
the same policy. Cleanup is attempted after lookup failure; a timed-out logout
does not set `sessionRevoked` and terminates the process with a cleanup error.

## Baseline result

| surface | n | p50 ms | p95 ms | max ms |
| --- | ---: | ---: | ---: | ---: |
| cold total | 10 | 612.0 | 967.3 | 967.3 |
| warm total | 40 | 366.7 | 469.6 | 584.9 |
| all total | 50 | 394.0 | 732.6 | 967.3 |
| route operation | 50 | 201.9 | 378.2 | 563.3 |
| exact group | 50 | 81.4 | 160.8 | 261.1 |
| user state | 50 | 54.4 | 113.1 | 140.1 |
| translations | 50 | 58.7 | 105.5 | 177.1 |
| route auth | 50 | 0.9 | 241.9 | 290.6 |

No request exceeded one second. All ten deliberately cold samples exposed the
expected cold-auth signal; warm exact-group p95/max were 113.5/261.1 ms. The
final controlled run therefore did not reproduce repeated exact-group
dominance. Direct SQL, `EXPLAIN`, indexes, and migrations remain unjustified in
this slice.

The repeatable application cost was serial composition after exact-group
resolution: user state completed before translation lookup began. At the
baseline medians, those three reads compose to about 173 ms; exact group plus
the slower of the two independent post-group reads is about 123 ms. The WIP
change overlaps user state and translations only after the atomic group has
supplied complete identity. A route-contract regression test proves both reads
are in flight together while preserving the exact group, entry and response
contract. Production after-data must be collected only after reviewed rollout.

Artifacts:

- `route-baseline-c7e2690.jsonl` — one sanitized row per request, including
  request ID and parsed `Server-Timing`;
- `route-baseline-c7e2690-summary.json` — p50/p95/max, outlier classification,
deployment identity and session cleanup result.

## Browser transition composition model

`browser-lookup-composition-wip.json` preserves the same authenticated
Training transition harness on desktop and 390x844. The fixture deliberately
models the route-contract regression test: serial 200 ms user-state plus
300 ms translation work is a 500 ms lookup composition, while the WIP overlap
is 300 ms. Five measured transitions follow one discarded warm-up transition
per profile/mode.

| profile | composition | n | p50 ms | p95 ms | max ms |
| --- | --- | ---: | ---: | ---: | ---: |
| desktop | serialized 500 ms | 5 | 548.1 | 555.2 | 555.2 |
| desktop | overlapped 300 ms | 5 | 352.3 | 355.1 | 355.1 |
| 390x844 | serialized 500 ms | 5 | 542.0 | 549.3 | 549.3 |
| 390x844 | overlapped 300 ms | 5 | 346.8 | 354.0 | 354.0 |

Every measured action kept the answered card visible for the first 100 ms and
waited for the authoritative next card; there was no optimistic advance or UI
redesign. This is deterministic browser evidence for the measured critical-path
composition, not a claim about post-rollout production latency. The same
production route benchmark must be rerun after reviewed rollout for real WIP
production numbers.

## Artifact integrity

- route JSONL SHA-256:
  `ebd2460e926f4b30c795271b694c7f2224a6d4b400114e5643b4768f665b75ce`;
- route summary SHA-256:
  `63f227a46090fe632e5a8ecfaf60e53bd579854607e14a0762a5a323d179dfea`;
- browser composition SHA-256:
  `04916852ef20f761d9e089d3ccaf7a0a4089c1afef17a12b2272dd59386b8a43`;
- benchmark source SHA-256:
  `43b7dc6cc2c442deac3294ab276a9be967d7613368eaed2c876cc0ce1c7ce4e6`;
- benchmark guardrail test SHA-256:
  `19bcdd3c116740a621de1a228623d34f18ba90a490bd5668c50e8bcc02ce948b`.
