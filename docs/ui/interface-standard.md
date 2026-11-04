# Interface standard

Use existing presentation components and semantic theme roles before adding screen-specific controls. Matching a font alone does not establish consistency: compare geometry, spacing, selected/hover/focus/disabled states and responsive behavior as well.

## Source of truth

- `apps/ui/components/practice/ui/practiceTheme.module.css`: semantic typography, palette, surfaces, borders, focus and radii; resolved account preferences supply their values.
- `apps/ui/lib/reading/textScale.ts`: account text-size scaling. Use semantic roles instead of fixed pixel sizes.
- `SegmentedControl standard`: existing shared choices, including Settings and Shared collection sections. Use `navigation` only for primary app navigation.
- `CollectionSortControl`: one sort trigger for personal, owned-shared and received collections; uses the Settings `ActionMenu` for the popup and sizes itself to the longest localized option.
- `SettingsLayout`, `SettingsPanel`, `SettingsRow`, `SettingsOptions`: settings structure and choices.
- `DialogSurface`, `ActionMenu`, `IconAction`, `AddAction`: reuse the appropriate existing interaction primitive rather than recreating its behavior per screen.

## Collection typography

Default sizes below scale with account preferences; both desktop and mobile names use the same role.

| Role | Token | Default |
| --- | --- | --- |
| Section heading, including Labels and All collections | `--practice-text-body-lg` | 16 px, weight 500 |
| Collection name in personal, owned-shared and received lists | `--practice-text-body` | 14 px, weight 400, line-height 1.5 |
| Sidebar scope and label names | `--practice-text-caption` | 12 px |
| Metadata and explanatory text | `--practice-text-caption` | 12 px |
| Ordinary catalog actions/search/sort | `--practice-text-small` | 13 px |

Personal, received and owned-shared names share a single rule in `organization.module.css`. Do not override their size independently at a breakpoint. Sidebar controls retain mobile touch targets even with smaller text.

## Choice control contract

Primary navigation has a 34 px visual height and a persistent group background. Ordinary choices use the `standard` 28 px visual family, transparent unselected backgrounds and a soft selected capsule. The shared component owns selection animation, focus, disabled states and reduced motion. Keep touch targets usable and non-overlapping. Primary launch actions have their own 44 px family and must not be flattened into ordinary choices.

## Session builder sources

Source type uses the shared `SegmentedControl standard`: All, Dictionaries and Collections remain available in the expanded Source header, independently of search. The header search action is a sibling of the Source disclosure, with its own expanded state and controlled search field. Opening search focuses the field; Escape or closing search clears its query and returns focus to the action. Closing Source also clears search. Type choices and selected material remain intact while search is hidden. Search and disclosure transitions respect reduced motion.

The unfinished Word activity controls are hidden. Existing recipe source/time scopes continue to apply unchanged; a compact localized explanation names any active saved scope. Editing another recipe setting must preserve those values.

## Before accepting a screen

Compare like roles across another existing screen, not merely adjacent labels. Check light/dark modes, narrow widths, long localized labels and account text scaling. Autosave success/pending announcements must not add/remove visible layout rows; failures remain visible. Document genuine exceptions instead of silently inventing a new control family.

## Current limits

The application has shared tokens and several interaction primitives, not a complete component library. Collection search fields and action buttons still have local layout styling; there is no universal shared SearchField or catalog action button to import. Shared catalog styles keep these consistent within Collections/Shared. Future extraction should move the real existing behavior into a reusable primitive rather than introduce a parallel visual system. This document does not claim every legacy screen has been audited or migrated.

## Automated checks

Run `npm run check:interface-standard` from `apps/ui`. The normal test and CI workflows also run it. The check enforces the recorded collection typography roles and shared sort/choice primitives. A broader scan rejects literal typography or color styling in component CSS. The legacy baseline is now empty and retired: the check rejects new exemptions and the former baseline-generation command is disabled.

The guard is a regression detector, not a visual approval: it cannot judge the beauty of spacing, guarantee that token choices fit every semantic role, or replace browser checks for overflow, focus and responsive behavior. Its tests deliberately introduce violations to verify that it rejects them.

One remaining native selector exists in the parent-label editor dialog; sorting in all three catalogs is migrated. That editor is an explicit remaining gap, not evidence that arbitrary native dropdowns are the standard.

The [baseline audit](interface-exceptions-audit.md) classifies the initial 65 entries and records their migration to zero grandfathered entries. Grandfathering is not visual approval.

## Deliberate special roles

The ordinary text scale remains 11/12/13/14/16/18/20/24px and larger named display roles. Special presentation sizes live with the theme, not as local exceptions: `--practice-brand-size` (26px), compact brand cap (22px), headword article proportion (.55em), literal translation proportion (.85em), recall-target size (title ×1.5), and face-context size (title ×1.2). The startup logo keeps 52px through `--practice-startup-logo-size` in the root startup appearance contract, available before account theme hydration. Moving these values into roles preserves their existing visual purpose; they are not ordinary catalog/control text.

Sign out uses caption12 at desktop, body14 at narrow widths, semantic danger/focus colors, and a 44px narrow-screen target. Its scoped selector must override the general Settings button font reset.
