# Interface literal baseline audit

Source audit: 2026-11-04. This classifies all **65 baseline entries** across 13 CSS files. A baseline entry is a declaration signature, not a visible control or an approved exception. No styles or baseline entries were changed for this audit.

## Classification

| Category | Entries | Meaning |
| --- | ---: | --- |
| Deliberate special typography roles | 8 | Brand/startup display sizes, relative reading proportions and the modest Builder heading. Preserve their purpose; a dedicated semantic token can still replace the literal. |
| Scanner false positives / already token-based | 4 | Semantic font-family fallbacks or a tokenized font shorthand with a fixed line-height. These do not establish a new font-size or palette. |
| Overridden in the approved presentation | 5 | Declarations remain in source but a more specific approved rule supersedes them; some remain available to legacy presentation. |
| Apparently unused legacy selector | 1 | No matching current JSX consumer found. Remove only after confirming runtime coverage. |
| Active legacy nonconformance | 47 | Reachable declarations lacking semantic typography/palette roles; grandfathered, not approved as exceptions. |
| **Total** | **65** | |

## Complete allocation by file

All component paths below are relative to `apps/ui/components/`.

| CSS file | Allocation | Source evidence and runtime limits |
| --- | --- | --- |
| `navigation/AppFrame.module.css` (3) | 2 special roles; 1 overridden | Desktop `.brand` 26px and mobile `.brand` min expression belong to `BrandLogo`, rendered by `AppFrame.tsx`. Keep logo proportions distinct from ordinary controls. `.selection` shadow is overridden by the later `.primaryNav .selection { box-shadow:none }`; `AppDestinationNav.tsx` supplies the primary navigation wrapper. The literal shadow fallback is not evidence of an active shadow there. |
| `onboarding/onboarding.module.css` (18) | 18 legacy | Tooltip surface/ink/border/shadow/font/heading, top metadata size/ink, common action border, primary fill/ink, instruction border/size/ink, recovery surface/ink/border/shadow. `Onboarding.tsx` uses the tooltip and recovery selectors. The combined action-border rule is superseded for Settings actions/topics by `.settingsPanel` rules, but still applies to tooltip/recovery buttons, so its entry remains active legacy. |
| `practice/article/articleContent.module.css` (3) | 1 special role; 1 false positive; 1 legacy | `.literalTranslation` .85em is intentionally relative to the containing translation, used by `ArticleContent.tsx`. `.languageLabel` font-family already uses the shared sense-sans variable with a generic fallback; scanner flags the fallback. Its 10px size remains legacy metadata sizing, not a proven special-size approval. |
| `practice/article/wordDetails.module.css` (2) | 1 false positive; 1 legacy | Same token/fallback family and fixed 10px label size, used by `ArticleWordDetails.tsx` for translation-language badges. |
| `practice/builder/builderControls.module.css` (1) | 1 false positive | Standard `.choice` uses `400 var(--practice-text-label)/18px var(--practice-font-ui)`. The font size and family are semantic; the scanner matches the 18px line-height. `BuilderChoice.tsx` consumes the class. Keep approved compact control geometry. |
| `practice/ui/wordIdentity.module.css` (1) | 1 special role | `.article` .55em maintains article/headword hierarchy at any inherited heading size. `WordIdentity.tsx` explicitly documents that relationship. Do not replace it blindly with a fixed caption size. |
| `reading/textPreferences.module.css` (1) | 1 apparently unused | `.headword small` .65em: current `ApprovedTextSizeSection.tsx` preview uses `SenseCardHeadwordLockup` and shared article content, with no local `.headword` consumer found in reading JSX. This is a cleanup candidate, not a visible mismatch demonstrated by this audit. |
| `releases/ReleaseUpdates.module.css` (18) | 1 false positive; 17 legacy | `.banner` family is already `var(--practice-font-ui, inherit)`. Remaining entries: 16 fixed sizes across banner/actions/link/dialog/hero/news/build info and responsive headings, plus 1 primary shadow declaration with literal fallback/highlight colors. `ReleaseUpdates.tsx` renders banner and Settings updates section through `AppFrame.tsx` / `ApprovedSettingsDestination.tsx`. Editorial heading hierarchy may be intentional, but no exact-size exception has been established; choose semantic roles after visual review. |
| `training/approvedTrainingCard.module.css` (2) | 2 special roles | `.recallTarget` title ×1.5 and `.faceContext` title ×1.2 are token-relative reading emphasis. `v2/TrainingCardTemplates.tsx` applies them conditionally to recall/context prompts. Preserve their relative hierarchy and fit behavior; these are not catalog labels. |
| `training/pilot/approvedTrainingBuilder.module.css` (4) | 1 special role; 3 legacy | Standard Builder heading 20px is the approved modest heading family. `.option` 13px, `.delete` 14px and narrow `.updateGroup > .secondary` 12px are active legacy literals; use semantic small/body/caption roles while preserving compact/launch geometry. Later footer rules change layout/height but do not replace these font sizes. Delete text is visually hidden by the later `.delete > span` rule, so its inherited font-size has limited visible effect on the current icon-only action. |
| `training/pilot/startupLogo.module.css` (1) | 1 special role | `.logo` 52px belongs to `StartupLogoScreen.tsx`, used during account presentation/bootstrap/recovery. A startup brand display size is distinct from a body or control role; do not flatten it into ordinary choices. Exact pixel approval is not independently proven by the control standard. |
| `training/pilot/trainingSourcePicker.module.css` (3) | 3 legacy | Toolbar field font 12px, list-button font 12px and count 11px. `TrainingSourcePicker.tsx` is rendered by `ApprovedTrainingBuilder.tsx`. Preserve source selection/search behavior and scroll affordances; migrate typography to semantic roles. |
| `training/v2/TrainingSessionLayout.module.css` (8) | 4 overridden; 4 legacy | Utility hover/focus and old progress-track/fill literals are superseded by `.viewportApproved` rules in approved `TrainingScreen.tsx`; `TrainingSessionChrome.tsx` only renders the old `.progress` for nonapproved presentation. They remain legacy fallback declarations, not globally dead code. Three responsive `.stats` sizes and `.statBar` background remain active through `TrainingSessionStatsFooter.tsx`, including approved sessions. Keep training geometry separate from ordinary segmented controls. |

## Next priorities

1. **Onboarding: 18 entries.** Highest concentration of hardcoded palette values on an active overlay, including recovery UI. Adopt inherited semantic surfaces/text/focus and typography; verify portal theme inheritance, dark mode, long translated text and account scaling. Retain the tour's placement and recovery semantics.
2. **Release updates: 17 nonconforming entries.** Map ordinary banner/action/body/metadata text first; separately review editorial title hierarchy. Replace literal shadow colors. Test the banner and Settings page independently.
3. **Small active typography slices: 8 entries.** Source picker 3, Builder nonconforming typography 3, article badge sizes 2. Prefer narrow changes with account scaling and touch/compact geometry checks.
4. **Training footer: 4 entries.** Review the three density breakpoints and bar color under all palettes; preserve fit and approved training layout. This needs a focused narrow-screen review rather than a global control restyle.
5. **Cleanup and checker precision.** Confirm the unused reading selector (1), remove or explicitly retain superseded fallback declarations (5), and teach the scanner to distinguish semantic fallback families/token-size shorthand (4). Review the 8 special-role entries before any new dedicated tokens. Do not regenerate the baseline merely to conceal a regression.

## Evidence limits

This is static import, JSX-selector and CSS-cascade tracing, not a new visual or accessibility acceptance test. Conditional paths are identified as reachable, not asserted to be currently visible for a particular account. Ordinary token checks do not establish contrast, computed inheritance, glyph fit or behavior. The baseline omits inline styles, utility-class literals, custom-property definitions and some fallback forms; its 65 entries are not a complete inventory of every interface inconsistency.
