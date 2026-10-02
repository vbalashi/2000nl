# Training startup continuity (#524)

Reported on test production 0.18.1065: refresh flashes the branded startup screen, the old Preparing training panel, then the approved overview.

## Reproduction

The actual-controller browser test `training-startup-continuity.spec.ts`, with staggered active-scope, list-summary and stats readiness, captured seven visible instances of the old Training voorbereiden panel before the overview. The approved presentation flags were enabled. The test fails on commit 4956a502 and passes after the change, including a real page reload.

Command: from apps/ui, run `TRAINING_RELIABILITY_DEV_LOGIN=true PLAYWRIGHT_BASE_URL=http://localhost:3100 NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 APP_ROLLOUT_PROFILE=pilot NEXT_PUBLIC_TRAINING_PRESENTATION_V1=true npx playwright test playwright/tests/training-startup-continuity.spec.ts --workers=1` against the approved local QA server.

## Cause and change

Authenticated bootstrap hands off to the Training controller before scope/statistics and account configuration are ready. TrainingTodaySetup still renders its legacy state panel during that second preparation phase. This is a presentation handoff, not evidence of duplicate auth bootstrap or disabled rollout flags.

Keep the existing neutral branded startup presentation across this handoff. Mount the real readers underneath it; release the presentation once the overview is actionable or a recoverable error/empty state is available. Latch readiness for the account lifetime so later refreshes or navigation do not restore the startup cover. After eight seconds the existing long-running message remains accessible. Auth, scheduler and session semantics are unchanged; this does not claim faster network requests.

## Verification

66 unit/component checks across startup, HomePage and TrainingTodaySetup; typecheck and lint passed (existing audio dependency warning). Nine actual-controller browser scenarios passed: startup/reload, new/paused/completed sessions, edit/restart, focus launch, real periodic authority polls, accepted targets and offline fencing. A unit check confirms readers remain mounted through the transition; other checks preserve long-running feedback and release actionable failures.

A mistargeted Playwright invocation from the repository root had no baseURL and could not navigate; the correct apps/ui invocation above was used for the recorded red/green result.

Production rollout and owner confirmation are pending.
