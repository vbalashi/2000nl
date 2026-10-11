# Training startup recovery after presentation retirement

Date: 2026-10-09. Source: owner Pixel screenshots and explicit instruction to fix. Owning issue: #575.

Confirmed: TrainingTodaySetup still renders TrainingPilotStatePanel for prerequisite loading and failure. After the startup gate settles on an error it stays settled during retry, exposing the framed preparing panel. Existing browser coverage explicitly accepts the error panel. The latest prompt/layout releases do not remove these paths.

Accepted: use the same branded startup surface for prerequisite loading and retry, with the existing three dots and accessible localized status. Real failures remain actionable with a localized retry control on the branded surface, without the obsolete panel or progress bar. Slow pending work remains pending; do not invent a timeout failure or blindly extend limits. Preserve mounted readers and authoritative session behavior. Scope belongs to apps/ui startup presentation; no DB or scheduling changes.

Unknown: the failed network request on the owner's Pixel was not captured. Presentation correction does not establish or claim to fix the original transport/server failure. Native OS splash remains fixed and platform-controlled; the installed-icon change #643 is separate and already on main. Do not change its approved artwork in this fix.

Additional reproduced retry bugs: the no-resume first visit can already have sessionResumeResolved=true when catalog loading fails. Retry cleared the saved record and scope without resetting that flag, so the reader refused to run and Start stayed disabled. A shared material catalog that failed on the same language RPC was also not refreshed by the Training retry. Both are corrected by rearming resume resolution and reloading failed account material reads. The browser regression failed with Start disabled before these corrections and passes afterward.

Implemented in the issue checkout: branded loading/recovery, mounted-reader gate coverage through retry, retired TrainingPilotStatePanel and its progress styles, and a retirement guard. True transport/server failures still expose retry; this does not identify the original Pixel request failure. Validation and PR checkpoint follow.

Validation: all 149 tests in TrainingScreen, TrainingTodaySetup, TrainingStartupGate, StartupLogoScreen, startupStatusContinuity and HomePage.loading passed. After the final readiness reset, the two affected resume/recovery tests were rerun successfully. Typecheck, lint (one existing unrelated handlePlayAudio dependency warning), shared style guard and final retirement guard passed. Mocked-data Playwright checks cover desktop/320px overview, reload continuity, and 390px failure → retry pending for 8.5 seconds → enabled Start. No production-network or native-phone claim.

Lifecycle: codex/575-startup-recovery is retained for PR review and local screenshot evidence. Release/merge, reference sync and retirement remain pending; the existing dirty #575 design checkout belongs to separate work and was preserved.
