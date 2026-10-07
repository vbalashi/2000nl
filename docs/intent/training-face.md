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

Validation: 107 targeted tests, UI typecheck and lint passed (existing unrelated hook-dependency warning). Desktop and 390×844 browser checks used the fixed `/dev/sense-card-gate?prototype=exercise` presentation fixture. Full local backend smoke was not performed: local DB contract 208 is older than app contract 211. No production deployment.
