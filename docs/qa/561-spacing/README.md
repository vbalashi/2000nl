# Account card spacing profiles — #561

Owner approved both profiles with a Settings choice. Default Balanced is independent of palette and device reading-size settings. Storage is user_settings.card_spacing, protected by the existing account-owned RLS. Migration200 is additive; postflight chains199. No FSRS/scheduler behavior changed.

Normal-scale Balanced: pair4px, sibling12px, section20px without visible translation /24px with it, rail3px. Airy:5/16/26-or32/5px. Gaps scale with reading multipliers1/1.25/1.5/2. Nested examples use the same16px literary role and translations13px as ordinary content. Library removes its redundant reveal margin. Hidden translations cannot trigger larger separation; partial content uses it when translations are visible.

Palette and spacing providers mount concurrently behind ONE combined ready gate, avoiding serial startup screens. Tests verify concurrent reads, owner switching/stale loads, save failure/retry, Settings choice, scoped repository writes, bounded deadline. Real disposable-Postgres test verifies defaults, own-row update, unchanged theme/textsize, foreign update0 and invalid-value23514.

Dev-only geometry harness renders production Article/Library/Training components with real goed source and authored Russian stress translations. No audit CSS overrides. Isolated browser blocks API/external calls; fixture learning state is deliberately unavailable. Indigo light/dark,390/610px, all four reading sizes, both profiles, off/on/partial form288 cases. All288 cases passed with zero horizontal overflow. Measurements/assertions cover section margins, pair gaps, nested example sizes and overflow; representative screenshots hide developer indicator only.16 separate keyboard checks prove named reading-region focus and End scrolling.

Native browser chrome zoom remains unverified. Isolated headless Playwright has no toolbar/extension native zoom control; CDP page/device scaling and CSS text enlargement are not native zoom. Owner Chrome was not touched. Final combined app/native zoom and independent visual review remain coordinator gates.

Reproduce dedicated3111 dev runtime with placeholder local Supabase credentials and both presentation flags; run scripts/capture-card-spacing-proof.mjs and scripts/check-spacing-interaction.mjs from apps/ui. Unit/typecheck/lint and disposable DB cardSpacingSettings.test.ts are separate checks. Stop temporary server/drop only dedicated DB after checks.

Validation completed:73TrainingScreen tests;7new focused unit/component tests;8existing appearance tests;1realDB persistence/RLS test;typecheck/focusedlint;new read-onlyprobe;288geometry cases and16keyboardchecks. Migration200 SHA256 b3baf70a1809907023db0cc88616bb4d0207ce657d6079ee920a7e327da3ff59. Manifest/bootstrap integration remains coordinator-owned.
