# Session builder interaction prototype — #407

Owner: current Codex design task, branch codex/407-builder-prototype.
Question: does the approved Pen interaction model remain clear while selecting, expanding, collapsing and editing nested filters at desktop and mobile widths?

Run from apps/ui: `npm run dev:builder-prototype`; open `http://127.0.0.1:3100/dev/session-builder-prototype`. No backend, credentials or login required. The command supplies a local placeholder configuration because the existing global app shell initializes its client; use the 127.0.0.1 origin rather than an already-authenticated localhost tab. This is fixture-only QA, not a local backend health check. Development only; production route responds with notFound. Uses existing Next fonts, navigation component, Lucide icons and shared Tailwind palette alongside the approved Pen purple.

One agreed design, not alternative concepts. Current user decisions supersede the older #407 single-family/inline-only brief for this isolated visual prototype; backend integration semantics are NOT changed here. Mixed families and typed answers are fixture-only interaction previews.

- Words / Idioms / Translation only; no Example sentences.
- No synonyms/antonyms controls; automatic eligibility of a future dedicated exercise is separate.
- Live summaries remain visible whether sections are open or closed.
- Removing Nouns clears article. Selecting both de and het clears the optional restriction. Other POS have no disclosure.
- Direction requires at least one and does not multiply meaning counts.
- Mobile compact direction cards emphasize the prompt and show quieter answers; white noun editor on mobile and pale editor within white panel on desktop.
- Fixtures include unknown POS and mixed/missing articles. Counts reflect source/POS/article/type fixtures, not actual coverage. Session size and balance do not implement scheduling.
- Inspector exposes state and delayed/zero/error calculation scenarios. Pending responses are cancelled on changes. Presets are memory-only.
- No actual training starts, persistence or learning-state mutations.

Review pending. Absorb verified decisions into implementation with proper runtime contracts and checks, then remove this disposable route; do not ship prototype logic as production scheduling.

Latest mobile review: two direction cards side by side with Direct selected initially, subtle selected fill and filled check; header divider and stronger prompt. Noun editor opens in an anchored focus popover with a dimmed/blurred dismissable backdrop, preserving choices on close.

Validation: TypeScript and focused ESLint passed. In-app browser interaction checks at 360/390px: live exercise summary; last direction retained; article all-selected reset; noun removal clears child; Escape closes popover; searchable source selection; in-memory named preset roundtrip; zero/error counts disable Start; no horizontal overflow. Desktop reviewed at the default browser width. This is fixture-only evidence, not backend verification.

Polish iteration 2026-09-26: reserve the page scrollbar gutter so accordion changes do not shift the centered layout; label-free exercise summary; a shared accessible purple dot marks active noun subfilters in both chip and summary. Optional noun restrictions are unchanged. Slimmer 32px desktop choices / 36–38px mobile controls, short press feedback, rotating chevrons, animated desktop height and mobile popup enter/exit, with reduced-motion overrides. Range endpoint captions now sit next to the track. Learning language is a transparent mobile row opening a compact picker. Dutch and English are explicitly illustrative fixture languages; switching language resets source/POS/article and updates examples and available sources. No claim about the user's active languages or production language support.

Polish verification: before correction main x changed 152.5 → 160 at 1280px when Exercises collapsed; after correction x remained 152.5. Desktop, 390px and 360px inspected; 360px popup bounds x17–326, content width345 ≤ viewport360. Checked language/example/source reset, label-free summaries, noun indicator, de+het normalization, close/preserve via Escape, and reopen. TypeScript and focused ESLint passed. Browser fixtures only. Reference research and review captures: docs/research/training-builder-polish-2026-09-26.md.
