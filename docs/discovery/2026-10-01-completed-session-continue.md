# Completed session offers disabled Continue

Confirmed in production 0.18.1063 using the isolated QA account. In the 30-action confirmation run, returning home after completing each of the first two 10-card sessions showed `Continue training [disabled]`, `Adjust`, and `Create training`; no enabled direct start button. The unchanged configuration can be started through Adjust. Screenshots and exact visible controls are retained with the raw run.

Owning chain:
- `TrainingScreen.tsx:2524` regards an existing session ID as ownership, regardless of completion.
- `TrainingScreen.tsx:1618` gives a word session with no current card preparation status `empty`.
- `TrainingScreen.tsx:2507` disables continuation unless preparation is ready.
- `AccountTrainingOverview.tsx:48` inserts that owned session as a resume item; its resume object does not distinguish completed from resumable.

This explains the observed dead end, without suggesting that disabled continuation for a paused, unavailable or failed session is always incorrect. Future correction belongs in the owned-session/home action projection: a terminal session should offer a new run, while a resumable session retains Continue and its identity. Avoid identifying sessions by preset name.

Acceptance for a future change: complete a real controller-driven session, return home, start another run directly; paused sessions still resume; preparation errors still expose retry; saved setups remain unchanged. This collection reproduced the problem in the actual browser; it did not add a deterministic mocked controller test or fix runtime behavior.
