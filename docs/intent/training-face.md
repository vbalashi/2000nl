# Training question face

Owner-approved visual direction: first (Soft hierarchy) refinement, 2026-10-07.

- Center the task and its content; keep instructions quiet, readable and without a chip background.
- Show canonical part-of-speech metadata with the same colored dot and label treatment as the answer.
- In word-in-context training, show the card headword translation separately as the recall target. Show the latched translated sentence below in the same reading font with a modest size and tone difference.
- Do not infer alignment, highlight a translated token, or derive the target from sentence text. Inflection and translation differences make that unreliable.
- If a headword translation is unavailable, omit the target and use the existing sentence prompt with a complete fallback instruction. Never show the Dutch answer early or manufacture a translation.
- Direct idioms ask for their meaning; reverse idioms ask for the Dutch expression. Use one instruction line, without redundant explanatory copy.
- While starting a session, hold the overview presentation until the session opens. On exit or failed start, display authoritative session progress again.

Implementation remains in the UI presentation layer. Card identity, scheduling, latched examples, hint semantics and review mutations stay with their existing owners.

## Motion and gestures

Owner selected instant replacement when animation is disabled, and a short whole-card vertical shift when enabled. The outgoing card fades/moves up 8px over 90ms; the incoming card fades/moves from 8px below over 130ms. Never interpolate headword typography or move a prompt into a different text role. Reduced-motion preferences reveal instantly.

Appearance owns four account-wide booleans in `user_settings`: card animation (default on), existing left/right grading swipe (default off), short downward translation swipe (default off), and headword double-tap syllable toggle (default off). The UI reloads these preferences on account change and when returning to the app. Failed saves retain the confirmed account settings. There is no browser-local preference copy.

A downward translation swipe uses the existing translation action after answer reveal. It can start in the lower non-scrolling card area; it is not restricted to the header. Scrollable answer content, controls, pinch gestures, upward motion and horizontal grading strokes retain their existing behavior. A short stroke is 40–130px within 700ms, with under 25px horizontal movement. The native touch listener is non-passive only on the card and only while this gesture is enabled. Actual iOS/Android scrolling and pull-to-refresh behavior still needs physical-device acceptance.

Double-click or double-tap toggles pronunciation separators only on a visible headword containing canonical `·` breaks; keyboard Enter/Space also toggles. It never reveals a hidden answer or infers syllables.

Validation: the obsolete local database was discarded and rebuilt through the harness. Contract 212 and the search index pass health, local dev-login reaches the training overview, and the account preference migration passed its managed gate. UI component and DB isolation checks cover the new interactions. No production deployment.

The optional read-only `check` command exposed an existing probe-chain defect: read-only-postflight-201/202 include general postflights which reach the writing characterization in postflight-177. Managed apply, health, and the new RLS/default/persistence test pass. The read-only harness defect is recorded separately; no version markers or receipts were inserted manually.

### Appearance controls refinement — 2026-10-07

Owner selected only the compact help icons from the third visual option. Keep all existing Appearance controls, typography and spacing; reuse SettingsRow and the existing materialToggle theme switch. Animation is a single switch. Gestures have a same-style heading and child rows indented 16px. Four muted 14px help icons disclose localized explanations. Remove the account/devices paragraph and On/Off segmented controls. Labels and narrow 390px layouts checked in Russian, English and Dutch; 18 related UI tests and typecheck pass. No account storage or gesture behavior changes in this refinement.
