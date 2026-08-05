# Training card tracer — PROTOTYPE, DELETE OR ABSORB

Question: does the accepted Training card contract remain usable across real viewport pressure, translation off/on, sparse/dense content, face/answer transitions, and internal scrolling while the action dock stays stable?

Run:

```bash
cd apps/ui
npm run prototype:training-card
```

Open `/prototype/training-card?variant=A`.

Variants:

- `A` — desktop centered stack;
- `B` — mobile fill stage;
- `C` — overflow stress lab.

Keyboard:

- `←` / `→` — change variant;
- `Space` — reveal answer from Face;
- `Escape` — return to Face;
- `T` — toggle translation;
- `H` — toggle hint.

This route is unavailable in production. It uses in-memory fixture state only and performs no backend or database mutations.

## Mechanical QA

- 1440×960 desktop and 390×844 mobile viewports checked;
- the mobile document stays exactly one viewport high (no page scroll);
- card and action-dock bounds are identical with translation off/on;
- overflow scrolls only inside the lexical body; the entity header and actions stay fixed;
- top fade appears after scrolling, bottom fade disappears at the end;
- Face/Answer, hint, report, mark-known, and undo transitions are interactive;
- translation, audio, and more-actions use the same compact icon-button contract on desktop and mobile; Face also exposes audio without revealing the answer;
- TypeScript, ESLint, and whitespace checks pass.
- independent visual QA passed with no High, Medium, or Low findings after the baseline and dock fixes.

Verdict: mechanically ready; product-owner visual review is still pending. After review, capture the accepted interaction rules in #74, remove this route, and implement the result cleanly in production components.
