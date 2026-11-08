# Interface standard

Use existing presentation components and semantic theme roles before adding screen-specific controls. Matching a font alone does not establish consistency: compare geometry, spacing, selected/hover/focus/disabled states and responsive behavior as well.

## Source of truth

- `apps/ui/components/practice/ui/practiceTheme.module.css`: semantic typography, palette, surfaces, borders, focus and radii; resolved account preferences supply their values.
- `apps/ui/lib/reading/textScale.ts`: account text-size scaling. Use semantic roles instead of fixed pixel sizes.
- `SegmentedControl standard`: existing shared choices, including Settings and Shared collection sections. Use `navigation` only for primary app navigation.
- `CollectionSortControl`: one compact `IconAction` for personal, owned-shared and received collections, matching Library sorting; uses the Settings `ActionMenu` for the popup and exposes the current order in its accessible label and tooltip.
- `SettingsLayout`, `SettingsPanel`, `SettingsRow`, `SettingsOptions`: settings structure and choices.
- `DialogSurface`, `ActionMenu`, `IconAction`, `AddAction`: reuse the appropriate existing interaction primitive rather than recreating its behavior per screen.

## Collection typography

Default sizes below scale with account preferences; both desktop and mobile names use the same role.

| Role | Token | Default |
| --- | --- | --- |
| Section heading, including Labels and All collections | `--practice-text-body-lg` | 16 px, weight 500 |
| Nested label group heading in the collection results | `--practice-text-body` | 14 px, weight 500 |
| Collection name in personal, owned-shared and received lists | `--practice-text-body` | 14 px, weight 400, line-height 1.5 |
| Sidebar scope and label names | `--practice-text-caption` | 12 px |
| Metadata and explanatory text | `--practice-text-caption` | 12 px |
| Ordinary catalog actions/search/sort | `--practice-text-small` | 13 px |

Personal, received and owned-shared names share a single rule in `organization.module.css`. Do not override their size independently at a breakpoint. Sidebar controls retain mobile touch targets even with smaller text.

Nested label groups use the same reading size as collection names, with weight
and indentation establishing hierarchy. Their collection rows are inset so the
collection title begins to the right of the group title, accounting for the
group's disclosure and folder icons.

## Choice control contract

Primary navigation has a 34 px visual height and a persistent group background. Ordinary choices use the `standard` 28 px visual family, transparent unselected backgrounds and a soft selected capsule. The shared component owns selection animation, focus, disabled states and reduced motion. Keep touch targets usable and non-overlapping. Primary launch actions have their own 44 px family and must not be flattened into ordinary choices.

## Session builder sources

Source uses the ordinary builder heading grid: the chosen source remains beside the title in both states and the chevron stays at the far right. Language, source, exercises, filters and session share the same title column and vertical centering. Source type uses the shared `SegmentedControl standard`: All, Dictionaries and Collections appear in a toolbar below the expanded heading, with the independent search action before All. The toolbar is hidden and inert while Source is closed. Opening search focuses the field; Escape or closing search clears its query and returns focus to the toolbar action. Closing Source also clears search. Type choices and selected material remain intact while search is hidden. Search and disclosure transitions respect reduced motion.

Session slider labels and selected values share the caption UI font at weight 400. Values stay on one line when space allows and wrap naturally on narrow screens.

The unfinished Word activity controls are hidden. Existing recipe source/time scopes continue to apply unchanged; a compact localized explanation names any active saved scope. Editing another recipe setting must preserve those values.

## Before accepting a screen

Compare like roles across another existing screen, not merely adjacent labels. Check light/dark modes, narrow widths, long localized labels and account text scaling. Autosave success/pending announcements must not add/remove visible layout rows; failures remain visible. Document genuine exceptions instead of silently inventing a new control family.

## Current limits

The application has shared tokens and several interaction primitives, not a complete component library. Words, Collections and Shared use the same `SearchField` surface; callers retain their input state, refs and clear actions. Catalog action layouts still have local styling. This document does not claim every legacy screen has been audited or migrated.

## Automated checks

Run `npm run check:interface-standard` from `apps/ui`. The normal test and CI workflows also run it. The check enforces the recorded collection typography roles and shared sort/choice primitives. A broader scan rejects literal typography or color styling in component CSS. The legacy baseline is now empty and retired: the check rejects new exemptions and the former baseline-generation command is disabled.

The guard is a regression detector, not a visual approval: it cannot judge the beauty of spacing, guarantee that token choices fit every semantic role, or replace browser checks for overflow, focus and responsive behavior. Its tests deliberately introduce violations to verify that it rejects them.

Collection parent labels and source metadata choices use `ChoiceSelect`, backed by the existing `ActionMenu`, with the selected tick on the trailing side. Label assignment uses trailing ticks and a dash for inherited parent membership, retaining accessible checkbox semantics. The assignment dialog names its collection in the heading and can create an empty root label without navigating away. Creating the label grants no access; saving its assignment retains the existing audience checks.

The [baseline audit](interface-exceptions-audit.md) classifies the initial 65 entries and records their migration to zero grandfathered entries. Grandfathering is not visual approval.

## Deliberate special roles

The ordinary text scale remains 11/12/13/14/16/18/20/24px and larger named display roles. Special presentation sizes live with the theme, not as local exceptions: `--practice-brand-size` (26px), compact brand cap (22px), headword article proportion (.55em), literal translation proportion (.85em), recall-target size (title ×1.5), and face-context size (title ×1.2). The startup logo keeps 52px through `--practice-startup-logo-size` in the root startup appearance contract, available before account theme hydration. Moving these values into roles preserves their existing visual purpose; they are not ordinary catalog/control text.

Sign out uses caption12 at desktop, body14 at narrow widths, semantic danger/focus colors, and a 44px narrow-screen target. Its scoped selector must override the general Settings button font reset.

## Training overview stability

The selected training card keeps the same responsive height while another saved
training or availability result loads. Its name occupies one line, with the full
name available as a native tooltip and accessible heading; its description reserves
two lines. An empty training keeps a disabled primary action in the same slot.
Editing remains available in the corner, while existing mix and early-review
shortcuts remain available when applicable. Empty-state guidance is exposed through
the action tooltip and a live description without adding another visible row.

Opening the editor is reported to its parent startup gate. Changing language keeps
the editor visible while catalog-dependent controls wait for their new material;
failures offer Retry inside the editor. The full startup surface remains for initial
loading and the overview. The All session-size option remains an ordinary-word
selection of currently available cards, not a continuously growing queue.

## Dictionary notes and translations

A usage note and its translations share the same reading size: caption for a
standalone note, small for a nested note. Both follow the account reading scale
in Library and Training. Translation color and spacing still distinguish the
pair. Definitions, examples and idioms retain their own reading hierarchy.

Original/translation paragraph spacing uses the shared article-pair token: 4 px
in balanced spacing and 6 px in airy spacing before account spacing scaling.

## Collection details and assignment

The title is the primary heading. Its access icon distinguishes personal, shared
by the current author, and received collections; received catalog rows also state
that they came from another author. No account identity is inferred from a title,
description or label. The current catalog does not provide an author display name.

Meaning count and compact read-only status sit immediately below the title. The
access explanation uses the existing help popover, available by pointer, keyboard
and touch. Source and Labels have subordinate headings and the same small content
inset. Labels carry folder icons. Empty labels describe the state rather than
imitating an action. Each displayed field has its own pencil action, including the collection name
in the heading. Empty metadata stays visible as a muted state. One field is edited
at a time. Enter or leaving the field saves a sparse patch pinned to its starting
revision; Escape cancels the draft. Menus and calendars save the chosen value
without committing while focus moves inside the picker. There is no second copy of the title or description in an expanded form.
The original material title is distinct from the user-chosen collection name.

Label assignment always exposes the shared search field. Collection names are
quoted in its heading, filtered-empty copy refers to labels, and hidden selected
assignments are preserved. Save and Cancel have the same minimum width. The
optional publication date uses the themed DateField dialog, locale-aware calendar
labels and keyboard navigation. Scrolling surfaces retain a thin, muted rail;
existing intentionally rail-free catalog lists remain unchanged.

Shared-label placement confirmation names the collection and group, with a localized
subscriber count in parentheses. Additions and removals describe their own effects;
changes that retain another accepted access route never claim a global access loss.
Explanatory group context is read against the prepared catalog revision. Stale or
unavailable context falls back to the authoritative audience delta; presentation
never bypasses the existing plan confirmation.

Single-field editing has no Save/Cancel actions. Inputs keep the reading baseline
without a boxed surface; opening a text editor selects its current value. Enter or
leaving focus commits once, while Shift+Enter keeps a description newline and
Escape restores the saved value. Failed saves keep the editor available for
correction or revision refresh. Empty metadata uses caption-sized muted ink.
