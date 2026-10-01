# Card continuity: next investigation pass

Baseline: deployed PR #517 / 0.18.1063; local PR #518 at 3240a300. The client fixes in #518 are not deployed. User reports periodic blinking and an apparent immediate repeat after answering, possibly observed before those fixes. Exact screen/cadence and target identity remain unconfirmed.

## Separate questions and ownership

- [#519](https://github.com/vbalashi/2000nl/issues/519): visible blinking. UI lifetime, focus, loading, action fencing and development updates; no confirmed cause.
- [#520](https://github.com/vbalashi/2000nl/issues/520): apparent repeated card. Entry + direction + session membership + accepted receipt; no exact repeated target reproduced.
- [#440](https://github.com/vbalashi/2000nl/issues/440), [#413](https://github.com/vbalashi/2000nl/issues/413): existing HTTP/SQL and planner attribution. Do not create a duplicate latency investigation.
- #147 and #250 are closed prior reconciliation/controller work, relevant context rather than proof that today's symptoms are fixed. #468 Continuous is a separate future queue contract.

## Feedback loops and observations

`TRAINING_RELIABILITY_DEV_LOGIN=true PLAYWRIGHT_BASE_URL=http://localhost:3100 npm run test:e2e:training-reliability` runs the actual Training controller with a mocked authenticated backend. New continuity tests are in `apps/ui/playwright/tests/training-idle-continuity.spec.ts`; the same explicit approved-presentation command is already in CI.

Idle test: 42 real seconds, at least two actual 20-second authority snapshot reads. MutationObserver retains the initial card node and rejects any detach or Training loading placeholder. Passed twice individually. This checks mounting/loading, not every color, opacity or paint change. Successful authority checks still temporarily fence grading. Study-time sampling uses refs and no React state timer animation. Neither inspection proves the reported cause.

Finite selection test: six successive Good actions with 150 ms selection/projection delays, then compare six entry/direction targets. Passed in 8 seconds. The fixture renders `bank` for distinct entries, so unchanged headword is not an identity assertion. This is a client/controller test; backend consumed-member SQL is mocked, not validated by this result. Failures in the first two test attempts were observer errors: waiting for Good on the new Face, then demanding a different headword. Those were corrected and are not product defects.

Codex in-app Library tab, no navigation or grading: captured Fast Refresh at 2026-10-01T21:21:14.447Z, complete in 193 ms. Network showed hot-update JSON/JS and CSS reads. This is an observed development-only alternative, not reproduction of the user's blink. A subsequent separate quiet window, 21:23:00.786Z–21:24:38.035Z (97,249 ms), recorded zero new network requests, no event truncation/paging. Endpoint-only data was printed; no headers, tokens or request bodies retained. Start/end screenshot showed the same open `-achtig` Library card. These endpoint observations cannot exclude an intermediate visual-only blink. Network instrumentation was disabled afterwards.

## What this pass excludes, and what remains

The controlled ordinary Training path does not universally remount/reload on authority polls or universally repeat an exact accepted target. These bounded green tests do not establish that intermittent production symptoms are absent or repaired. No runtime change was made for either new symptom; no security/authority check was removed.

Ranked next discriminating captures, not diagnosed causes:

1. Local Fast Refresh: blink timestamp should coincide with HMR; isolate a production build/no-edit window before changing runtime logic.
2. Authority fencing: button disabled/appearance changes without card detach, at snapshot cadence; distinguish failed ownership validation from successful checks.
3. Lookup/translation refresh: loading or presentation identity changes must correlate with the actual request/result, not merely a React render.
4. Apparent repeat: hash exact entry/direction/session/presentation identity and accepted receipt. Same headword, sibling direction, rejected action retaining card, accepted action with stalled next presentation, and exact consumed-member repeat are different outcomes.

## Server branch: avoid repeating an inconclusive experiment

Previous #440/#413 evidence already includes simultaneous activity samples with null wait events, candidate-helper execution as the slow boundary, small temporary I/O, and fast first-use backends. Today's connector verified project `2000nl`, region `eu-west-1`, status `ACTIVE_HEALTHY`; metadata exposes neither compute size nor contemporaneous CPU/memory/disk. Healthy is not a resource measurement. No CPU sizing conclusion follows.

The useful next server experiment is still an exact captured QA browser scope/role paired with a slow inner plan and managed-host telemetry. Prior persisted-collection probes are not an equivalent replay. No production SQL probe, learner write, migration, timeout increase, deployment or infrastructure change was performed in this pass. Findings were added to #440 instead of repeating warm/cold timing without a discriminator.

## Next checkpoint

Local validation of this checkpoint: all four approved-presentation browser reliability tests passed in 56.7 seconds; typecheck passed; lint passed with the pre-existing `handlePlayAudio` dependency warning at TrainingSenseCardV2Session:618. No temporary debug logging was added to runtime code. CI must be evaluated at the new evidence commit, not inferred from green checks on 3240a300.

Review/deploy the already verified #518 corrections through the existing release process, then collect the original QA identity sequence and a blink event trace on that exact deployed build. Preserve reported #519/#520 until either the original symptom is reproduced/fixed or a trace establishes an expected distinct target. Do not close them on mock-only green tests.
