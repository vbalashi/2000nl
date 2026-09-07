# Stable application frame contract

Owner: [#264](https://github.com/vbalashi/2000nl/issues/264), within #58.
Status: implemented in draft PR #275; final independent review is in progress.

This document describes the application around the learning card. It does not
change card typography or idiom presentation (#249, #251, #272), and it does
not redefine accepted-grade recovery (#250).

## Product rule

Training, Library, Statistics, Settings and History are destinations inside one
application. Starting a session changes the content below the application
header; it must not replace the application header or recolor the whole product.

```text
┌──────────────────── one AppHeader ─────────────────────────────┐
│ 2000nl          Training · Library · Statistics     Theme · ⚙  │
└─────────────────────────────────────────────────────────────────┘
             ↓ destination content changes below this line

active Training only:
        ┌──────── attached SessionStatusBar ────────┐
        │ session name · position        History  × │
        └────────────────────────────────────────────┘
        ┌──────────── 760 px card stack ────────────┐
        │ card + actions                             │
        └────────────────────────────────────────────┘
```

`AppHeader` owns the brand, primary destinations, Theme/Settings, height,
surface color and outer insets. `SessionStatusBar` owns the session name,
position/progress, History and Close. A card never owns either one.

## Confirmed values

| Part | Contract | Source |
| --- | --- | --- |
| App header height | 58 px + top safe area | accepted Training layout B |
| Training content width | maximum 760 px | #251 / Pen 30.90 |
| Session row | 48 px, same width as card stack | #251 |
| Session row → card | 10 px | #251 |
| Training horizontal inset | 16 px phone; at least 24 px desktop | #251 |
| Training footer | 44 px + bottom safe area; New/Review/Total stay on one line | #251 |
| Session title | one quiet line; no separate “Training” eyebrow | owner decision |
| Session actions | History and Close live in the session row | owner decision / #264 |
| Reading/card type | unchanged by this work | #249 / #251 / #272 |

The owner preferred the lighter 26 px Training logo. The preview applies it to
the common header so its weight can be judged across Library and Training
together; it becomes final only with the selected frame.

## State matrix

Empty cells are intentional: they are decisions or evidence still needed, not
permission for each screen to invent a value.

| State | Same AppHeader | Desktop primary nav | Mobile primary nav | Session row | Inner width |
| --- | :---: | :---: | --- | :---: | ---: |
| Bootstrap/loading | required | visible, disabled while unavailable | compact switcher, disabled | — | loading content only |
| Training Today/setup | required | visible | compact switcher | — | max 1024 px today |
| Training Face | required | visible | compact switcher | required | max 760 px |
| Training Answer | required | visible | compact switcher | required | max 760 px |
| Training More | required | visible | compact switcher remains behind drawer | remains behind drawer | drawer contract #252/#271 |
| Library | required | visible | compact switcher | — | max 1200 px |
| Statistics | required | visible | compact switcher | — | pending owner comparison |
| Settings | required | visible | compact switcher | — | pending owner comparison |
| History | required | visible | compact switcher | — | max 768 px today |

## Mobile navigation decision

The development gate compared three structures at 390×844 and 320×568 before
the production component was implemented:

1. `top-tabs` — destination tabs form a second row of the common header; no
   bottom navigation competes with Training progress.
2. `bottom-tabs` — today’s bottom destination tabs remain below the Training
   footer; this exposes the cost of two stacked bottom bars.
3. `menu` — the common header stays one row tall and a compact destination menu
   opens the three choices; more card height, but navigation needs an extra tap.

`bottom-tabs` was rejected because Training already owns a bottom progress row.
`top-tabs` costs a complete extra row on a 320×568 phone. The selected target is
`menu`: its visible label is the current destination (including Settings and
History), and one tap exposes all three primary destinations. Escape, an outside
tap and a destination choice all close it; keyboard focus returns to its trigger.
The comparison-only implementations
were deleted after the decision, so they cannot drift back into production.
The same treatment is used in every mobile destination. Desktop is not allowed
to switch to the phone layout merely because a desktop window becomes narrow.

## Width policy

The outer application frame is always full viewport width. Inner content width
expresses the job of the destination:

| Destination | Current | Proposed target | Decision |
| --- | ---: | ---: | --- |
| Training card/session row | 760 px | 760 px | confirmed |
| Training Today/setup | 1024 px | 1024 px | preserve unless preview disproves |
| Library two-column workspace | 1200 px | 1200 px | implemented; visual acceptance pending |
| Statistics | 1152 px | 1152 px | preserve, then compare |
| Settings | 1024 px | 1024 px | preserve, then compare |
| History | 768 px | 768 px | preserve, then compare |

Different inner widths are not a header jump: the common header and outer page
insets stay fixed while only the destination workspace changes width.

## Implementation and deletion rule

Target shape:

```text
AppFrame
├── AppHeader
│   ├── BrandLogo
│   ├── AppDestinationNav
│   └── AppUtilityNav
├── optional SessionStatusBar
├── DestinationContent
└── selected mobile navigation treatment
```

After all consumers move, delete the six hand-written destination headers and
`TrainingSessionAppHeader`. Do not retain a legacy adapter. Old Training card
rendering is a separate content migration tied to #250/#251 and is not removed
inside this shell-only slice.

## Required evidence

- 1440×960 light and dark: Today → active Training → Library → Statistics.
- 390×844 and 320×568 light and dark: the selected mobile navigation in Today,
  active Face/Answer and Library, with no double dock or unreachable controls.
- 1024×600: compact-height behavior without reducing reading text or buttons.
- Header/logo/nav/utility bounding boxes and surface colors remain unchanged
  across destination changes and session start.
- Returning from destinations preserves exact Training card and side.
- Pending mutation cannot be abandoned. The final recovery guarantee remains
  blocked on #250; #264 must not invent a second transition owner.

Automated evidence now asserts the 1440×960 header geometry and colors across
Training, Library, Statistics and Settings; exact Training card/side restoration;
the 1200 px centered Library workspace; the selected menu at 390×844; complete
one-line footer labels and no horizontal overflow at 320×568; and immediate
blocking of destination, History and Close controls during a delayed mutation at
1024×600. Final owner visual acceptance remains a separate gate before merge.

## Representative implementation renders

- [1440 × 960 · active Training · light](assets/1440-active-training-light.png)
- [1440 × 960 · Library · dark](assets/1440-library-dark.png)
- [390 × 844 · Training menu open · dark](assets/390-training-menu-dark.png)
- [320 × 568 · Training · dark](assets/320-training-dark.png)

These renders use the deterministic authenticated Training fixture. The 320 px
check also asserts no horizontal overflow and keeps the session Close control
visible. The menu-open image is evidence of the navigation treatment, not a
default open state.
