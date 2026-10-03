# Shared article typography and spacing — review candidates

Status: **ready for owner choice; not approved for production styling**. Issue #534; coordination #533; draft PR #540. Audited production source: `28e4ea42bad59b1beac03c9cbc89223542f4b0bf`. Product styles and learning state are unchanged.

Open [the comparison](comparison.html). It switches translations on/off and610/1440px captures, and shows the recommended treatment in real Library/Training card containers, day and night. Recommendation: **Balanced**. Airy uses the same type sizes but requires more scrolling.

## Provenance and scope

The dev-only harness renders actual `ProductionArticleReading`, `ArticleContentNode`, `ArticleMeaningDetails`, `ArticleSenseRelations`, `ArticleWordForms`, `LibrarySenseCardGroup`, and `TrainingSenseCardStage` components. Account sizes use `accountTextSizeStyles`. No parallel handwritten reading renderer is substituted.

Three real goed adjective meanings cover definitions, examples, idioms, nested explanation/example, synonyms, antonyms, forms, long/wrapped strings and multiple senses. Sources are existing `goed-source-fixture.json` and `word-details-fixture.json`. A complementary aandoen fixture preserves exact Dutch definition, usage and example text from `000031_a31_aandoen_ww_3.json`. English translations are explicitly authored design fixtures, not provider responses. Partial mode removes examples' translations while retaining idiom/explanation translations. IDs and canonical-source SHA256 are in [the manifest](fixture-manifest.json).

The baseline is the production shared-component cascade in a fixture shell. Library uses its actual card group and sheet classes; Training its actual stage. Navigation, live authentication, API loading, mutations and sheet gestures are not simulated. The audit resets the sheet's fixed inset inside its bounded relative-positioned shell. This adaptation does not change production geometry.

Browser: isolated headless Playwright; no owner Chrome interaction. All API/cross-origin requests blocked. Port3111 is temporary because3100 belongs to a separate active worktree. Fonts resolved to Newsreader and Inter from the real app.

## Measured typography contract

Normal account scale, all sizes/leading in px. Exact families, weights, styles and bounds at all four scales are in [measurements.csv](measurements.csv). Tokens are owned by `practiceTheme.module.css` and `textScale.ts`; reading rules by `articleContent.module.css`, `wordDetails.module.css`; inherited account aliases by `productionArticleReading.module.css`.

| Semantic role | Current size / leading | Both proposals | Token/rule |
|---|---|---|---|
| Definition |20 /28, Newsreader normal|unchanged|`--practice-definition-size`|
| Main example, idiom |16 /22.4, Newsreader italic|unchanged|`--practice-literary-size`|
| Nested example |**14 /20.3**, Newsreader italic|**16 /22.4**|currently nested `--practice-reading-body`; proposed literary role|
| Synonym/antonym |16 /22.4, Newsreader italic|unchanged|literary role in `wordDetails.module.css`|
| Usage pattern |16 /22.4, Newsreader normal|unchanged|literary size, normal style|
| Nested explanation |13 /19.5, Inter normal|unchanged|`--practice-reading-small`|
| Main translation |13 /18.2, Inter normal|unchanged|`--practice-reading-small`|
| Nested translation |**12 /18**, Inter normal|**13 /18.2**|currently caption; proposed shared translation role|
| Section/role label |11, Inter uppercase|unchanged|`--practice-text-label`|
| Forms |18 normal, capped at28.8 extra|unchanged|`--practice-reading-forms`|

The owner's smaller nested example is confirmed: `het voorstel om wat vroeger naar huis te gaan…` actually resolves14px versus16px for `Ruud is een goede leraar`. The nested translation also shrinks13→12px. Nesting is the cause, not viewport scaling.

Account scale reading multipliers are1 /1.25 /1.5 /2 (normal/large/largest/extra). UI labels and display text use their existing separate multipliers. There is no fifth “compact” account setting in this baseline.

## Spacing candidates

Values are proposed, not approved tokens. Measurements distinguish declared margins from actual element gaps.

| Relationship | Baseline | Balanced | Airy |
|---|---|---|---|
| Original → translation |2|4|5|
| Top-level siblings |8|12|16|
| Section margin |12, first-child exception2|20 off /24 on or partial|26 off /32 on or partial|
| Rail top/bottom padding |0|3 /3|5 /5|
| Rail left inset |10|10|10|
| Nested example reading size |14|16|16|
| Nested translation size |12|13|13|

Relation rails receive the same proposed vertical padding. Nested explanation backgrounds/role labels retain their existing hierarchy. Candidates add `overflow-wrap:anywhere` as a last resort for compounds under narrow/enlarged text conditions; normal words do not change size.

Library has an additional expanded-detail reveal margin:12px without lead translation,16px with it. Adding a20px shared section margin alone produces a stacked boundary. Audit candidates remove that redundant reveal margin and let the section own its boundary. Library's separately rendered lead translation also receives the proposed pair gap. This must be handled explicitly in implementation; changing one theme token alone is insufficient.

`context-measurements.json` records original/translation pair gaps, sibling and section gaps, and rail top/bottom bounds. Rail bottom is measured against all visible descendant paragraphs, including nested explanation/example; a whole nested block is not misreported as bottom padding. Hidden translations and collapsed meanings are excluded. A representative390/normal/on Balanced case measures4px paired-text gaps and20px section gaps in all three contexts in the previous candidate revision. The new translation-enabled conditional revision is measured separately below.

## Evidence matrix and validation

| Sweep | Coverage | Result |
|---|---|---|
| Core geometry |216 =6 widths ×4 sizes ×3 translation states ×3 treatments|14,904 visible-element rows; no horizontal overflow|
| Widths |390,610,700,701,1024,1440|Includes breakpoint neighbours|
| Context/theme |144 = article/Library/Training ×390/1440 ×normal/extra ×graphite/lavender/blue ×light/dark ×off/on|No horizontal overflow; palette variables and text colours recorded|
| Extra reflow |6 =320/610 ×off/on/partial, extra account size +200% root text|All six pass after audit-only wrapping safeguard|
| Keyboard reading |12 = Library/Training ×390/701/1440 ×normal/extra|Named reading region has visible focus; End reaches actual content end|
| Validation |UI typecheck; diff check|Pass at recorded checkpoint|

`measurements.json.gz` is lossless per-case geometry. CSV is its readable projection. `context-measurements.json` includes pair/rail measurements and palette values. `interaction-checks.json` records named reading-region end/focus and subsequent Tab order. Core screenshots are normal-size610/1440 off/on; representative container screenshots are390px normal, graphite, day/night. Reflow screenshots are separate and labelled by width/translation state.

The initial small fixture checkpoint and hidden-DOM row counts are superseded by this visible-element dataset. During audit development, an audit-only white dark-mode wrapper, relative sheet inset, candidate specificity collision and generic region locator were corrected before final captures. These were harness defects, not reported production regressions.

## Indigo evidence for separate colour work

At baseline28e4ea42, `apps/ui/components/training/v2/TrainingSenseCardStage.tsx:552` legacy renderer uses `bg-indigo-600`, hover `indigo-700`, dark fill `#292650`, dark hover `#332f60`, text `indigo-100`. Its last file change is `3b8e1908e8232eaffc40df686664772ed4c0ff93`. `SenseCardChrome.tsx:175` also uses indigo600 for translation controls.

Installed Tailwind from the committed lockfile resolves600 **#4f46e5**,700 **#4338ca**,500 **#6366f1**,100 **#e0e7ff**. This is an exact historical code-backed source candidate, not proof of which remembered screenshot the owner meant. Current Blue uses accent **#456d9f** and remains distinct. No full Indigo palette is invented here; evidence shared with the colour implementation owner.

## Approval and remaining integration QA

- Owner selects Balanced or Airy before production typography/spacing changes.
- Independent visual review is required after implementation.
- Native browser chrome zoom remains a check in the owner's configured Chrome. The measured200% root-text enlargement is text-only reflow, not native browser zoom.
- Indigo needs palette smoke after it is integrated; it does not exist in this baseline.
- Full app navigation, sheet gestures, grading and real provider translation responses remain integration tests outside this bounded reading study.
- Prior407 and2026-09-28 proposals were reviewed as historical input, not approved pixel values. Program registry and Pen rules were read. No approved Pen node was edited, exported or relabelled. No owner selection is implied by these artifacts.

## Reproduce

Bootstrap dependencies in the dedicated worktree. Run fixture-only Next dev on3111 with local placeholder Supabase values and `NEXT_PUBLIC_SHARED_ARTICLE_PRESENTATION_V1=true NEXT_PUBLIC_TRAINING_PRESENTATION_V1=true`. From `apps/ui` run:

```
node scripts/capture-article-audit.mjs
node scripts/capture-article-context.mjs
node scripts/check-article-interaction.mjs
npm run typecheck
```

The capture scripts block API/external calls. Production route returns404. Stop temporary server after capture. For partial reruns, `AUDIT_VARIANT=airy` refreshes one treatment; `AUDIT_SURFACE=library` refreshes one context; `REFLOW_ONLY=1` refreshes enlarged-text cases. Partial runs require the existing uncompressed measurements JSON generated by the full run.

Additional boundary probe: [library-boundary-check.json](library-boundary-check.json) records the previous revision: exactly20px from last visible lead paragraph to first section label with translations both off/on, and4px definition→translation gap when on. This confirms the Library-specific reveal-margin correction rather than merely checking its CSS declaration.

## Russian supplement

18 representative Russian cases were added at610px ×normal/large ×off/on/partial ×three treatments. No overflow; nested example/explanation translations reach three lines while retaining4px Balanced/5px Airy pair gaps. [Author visual review](author-visual-review.md) distinguishes findings from remaining conditional-spacing/rail-symmetry decisions. This review is not independent. Russian screenshots are now included in the comparison HTML; provenance is explicit in the manifest.

## Conditional-spacing revision (2026-10-03)

Audit candidates now explicitly increase section margin when translation mode is on or partial: Balanced20→24px; Airy26→32px. The paired original/translation remains4px/5px. Partial mode deliberately keeps the larger group separation even for untranslated examples, preventing mixed-density section rhythms. Russian comparison controls use610px and normal/large captures. Fresh216core cases (14,904rows) and18Russian cases pass without horizontal overflow; executable Russian assertions verify all section margins and pair gaps; older context/theme/reflow measurements remain evidence for the prior candidate geometry, not proof of this conditional revision.

Fresh Russian measurements: Balanced section margins20off/24on+partial, pair4px; Airy26off/32on+partial, pair5px, at normal and large scale. Typecheck and diff checks pass. Clean captures hide only the developer portal. See independent-visual-review.md for remaining gates.
