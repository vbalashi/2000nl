# Shared article audit — first measured checkpoint

Status: REVIEW candidates, **not approved and not complete #534 acceptance**. Production styles unchanged. Owning issue #534; parent #533. Baseline source 28e4ea42bad59b1beac03c9cbc89223542f4b0bf.

## Evidence

[Comparison](comparison.html) shows baseline and two candidate treatments. `measurements.csv` contains 14,616 actual browser element measurements from 216 cases: 390/610/700/701/1024/1440px × account normal/large/largest/extra × off/on/partial translations × baseline/balanced/airy. No document horizontal overflow detected in these cases. JSON preserves case metadata and overflow results. Twelve fixed-size full-page screenshots cover 610/1440 normal off/on.

This is a real shared-component fixture harness, not a complete production screen. It uses ProductionArticleReading, ArticleContentNode, ArticleMeaningDetails, ArticleSenseRelations and accountTextSizeStyles. Three actual goed adjective meanings provide long nested examples, idioms and explanations. English translations are existing authored demo data; partial removes example translations. No API calls or learning writes. Browser is isolated automated headless Playwright, not the owner's Chrome. Port3111 was temporary because3100 was occupied by another dirty worktree.

## Confirmed mismatch and current roles

Measured 610 / normal / translations on; all sizes px. Full family, style, weight and bounds in CSV. Typography owner: `articleContent.module.css`; scale owner `textScale.ts`; inherited bridge `productionArticleReading.module.css`.

| Role | Current size / leading | Candidate | Evidence |
|---|---|---|---|
| Definition | 20 / 28 | unchanged | `iets wat goed is…` |
| Top-level example, idiom | 16 / 22.4, reading serif italic | unchanged | `Ruud is een goede leraar` |
| Nested example | **14 / 20.3**, reading serif italic | **16 / 22.4** in both | `het voorstel om wat vroeger…` |
| Original nested explanation | 13 / 19.5, UI sans | unchanged for first comparison | `iets wordt gewaardeerd` |
| Main translation | 13 / 18.2, UI sans | unchanged for first comparison | source/translation pairing |
| Nested translation | **12 / 18**, UI sans | unresolved; compare equal-role 13 next | nested example translation |
| Section label | 11, UI sans | unchanged | separate from reading role |

Thus the owner's smaller nested-example observation is confirmed by the production cascade, not screenshot perception. Nesting explicitly switches to `--practice-reading-body` (14) versus `--practice-literary-size` (16). Nested translations also shrink from13 to12.

## Spacing proposals — not accepted tokens

| Relationship | Baseline CSS | Balanced | Airy |
|---|---|---|---|
| Original → translation |2|4|5|
| Sibling top-level content nodes |8|12|16|
| Section margin-top |12 (first-child override2)|20|26|
| Rail top/bottom padding |0|3 /3|5 /5|
| Rail inset |10|unchanged|unchanged|

Margins are declarations, not guaranteed ink-to-ink gaps: collapsed margins, label height and nested wrappers affect actual geometry. CSV includes element bounds to derive those gaps. Both candidates keep text-pair gap below item gap below section gap. Nested explanation wrapper remains current production recipe, including its label and border rules; a final contract must resolve the nested translation role and wrapper spacing too.

## Remaining mandatory audit before style approval

This checkpoint does **not** cover synonym/antonym/usage rails (goed demo lacks those projections), headword/forms, real Library and Training container heights/scrolling, all palettes/night, zoom, keyboard focus, or exact pair/rail ink bounds. Add complementary real normalized fixtures for these and expand capture selectors to wrappers. Account scale names are normal/large/largest/extra, not an assumed compact setting. Candidate variants currently only test nested example equalization and top-level grouping; do not merge broad styling from this checkpoint.

Prior407 audit and2026-09-28 nested-reading proposals are historical evidence, not automatically approved pixel values. Approved visual registry and Pen canvas rules were read. No approved Pen node was edited; no Pen export or owner selection exists for this revision. Publish this checkpoint as review evidence, then update the registry only after supported Pen review/export and explicit owner selection.

## Indigo historical evidence

Exact existing pre-approved-renderer branch in `apps/ui/components/training/v2/TrainingSenseCardStage.tsx:552` uses `bg-indigo-600`, hover `indigo-700`, with dark fill `#292650`, hover `#332f60`, text `indigo-100`. This branch exists at baseline28e4ea42 (last file change3b8e1908e8232eaffc40df686664772ed4c0ff93). Tailwind installed from committed lockfile resolves indigo600 **#4f46e5**,700 **#4338ca**,500 **#6366f1**,100 **#e0e7ff**. `SenseCardChrome.tsx` additionally uses indigo600 for translation controls. This is an exact code-backed candidate for the old blue, not proof which historical screen the owner meant. Current Blue uses accent#456d9f and should remain distinct. No complete Indigo palette has been invented or applied.

## Reproduction

Bootstrap worktree dependencies, run fixture-only Next dev on3111 with local placeholder Supabase values, then from apps/ui run `node scripts/capture-article-audit.mjs`. Script blocks all cross-origin and API requests. `npm run typecheck` passes. Baseline has no audit typography overrides. Production route returns notFound. Stop temporary server after capture.
