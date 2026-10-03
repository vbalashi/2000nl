# Training return continuity — 2026-10-02

Baseline: 28e4ea42, approved presentation, desktop 1440×900.
Controlled Playwright fixture: real UI, mocked training/network responses, 500 ms bootstrap read delay. Local wrapper on temporary 3104; health ok, database target local. Not production performance evidence; owner browser untouched.

## Reproduction and result

Idle overview → Library → Training produced visible “Training voorbereiden” on all 10 baseline returns. Active-session variant produced zero. A one-return minimization reproduced in 3.9 seconds. Mutation trace showed a training-context panel and no startup gate, ruling out startup-gate remount for this reproduction.

`useTrainingActiveList` refreshes on both changes of `showSettings` (Library visibility). Each refresh set an already successful catalog to loading. Training prerequisites mapped that to pending, replacing the ready overview with Preparing Training.

The fix preserves ready status during same-owner/language revalidation; initial loading and explicit error states remain. Owner or language change clears the catalog and restores loading. No scheduler/session state changes.

After fix: zero observed Preparing Training flashes in 10 idle and 10 active returns. The hook regression failed before the fix (`loading` instead of `ready`) and passes after. Refresh failure still exposes error and retains previous rows. Owner/language-reset tests prevent ready reuse across scopes.

## Commands

From apps/ui:

```sh
npx vitest run tests/useTrainingActiveList.test.tsx
TRAINING_CONTINUITY_DEV_LOGIN=true PLAYWRIGHT_BASE_URL=http://localhost:3104 NEXT_PUBLIC_TRAINING_PRESENTATION_V1=true npx playwright test training-return-continuity --workers=1
npm run typecheck
npm run lint
```

13 hook tests and 2 browser scenarios pass. Browser fixture requires approved presentation; dev-login is optional for environments with fixture-compatible Supabase origin. Initial fake-session attempt reached login rather than training; switching to the repo dev-login helper corrected the harness setup.

Remaining: independent review and combined release QA, then limited production verification. This establishes one exact navigation-flash cause, not all possible production flicker causes.
