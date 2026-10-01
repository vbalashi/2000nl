# Reliability repair evidence

Read-only, QA-only production SQL probes; no schema/session/scheduler changes. Individual statements bounded at 8 seconds, locks at 1 second. Scope is the QA persisted active collection; exact equality to the browser session’s ephemeral selection is not established. Session settings JIT, custom plan and I/O timing are local to the connection and rolled back. SQL requires the allowlisted QA email as a psql variable; no credential is retained. UUIDs in plan output have been hashed.

- `plan-one.log`: a single plan(10) statement timed out (>8s).
- `plan-jit-off.log`: same public function with session JIT off, 4764.664 ms.
- `plan-one-repeat.log`: subsequent default run, 1919.069 ms. This falsifies treating JIT as the demonstrated sole cause.
- `candidates-explain.log`: expanded current candidate SQL, JIT off, 544.770 ms, 2382 candidates. Expanded SQL is a diagnostic variant, not exactly a cached function plan.
- `candidate-variants.log`: default/custom/default/JIT-off candidate function counts, 742.755 / 276.697 / 254.642 / 248.155 ms. Order/warming confounds the first improvement; custom plan/JIT changes show no strong benefit over the warmed default.
- `plan-io.log`: public plan, 517.871 ms, shared disk reads zero; temporary read/write time 2.084 / 2.502 ms. No inference about unobserved slow intervals or host saturation.

Browser regressions: `apps/ui/playwright/tests/training-completed-restart.spec.ts` drives actual session controller with mocked backend exhaustion and verifies restart and paused resume. Local command: `TRAINING_RELIABILITY_DEV_LOGIN=true PLAYWRIGHT_BASE_URL=http://localhost:3100 npm run test:e2e:training-reliability`. CI uses isolated mocked auth; approved presentation flags are set by the npm script.

Client regression command: `npx vitest run tests/platformV2TrainingClient.test.ts`. The pre-fix accepted-action regression failed in 9 ms (`expected Promise to be null`); all 40 tests pass after repair. Includes late-response rejection, sibling direction, Library mutation, rejected mutation and unrelated entry preservation.
