# 2000NL Design Guide

Comprehensive reference for all visual design values used in the training card UI. Values are extracted directly from source code (`TrainingCard.tsx`, `TrainingScreen.tsx`, `tailwind.config.js`).

## 1. Color System

### Custom Tokens (`tailwind.config.js`)

| Token | Hex | Usage |
|---|---|---|
| `primary` | `#2e2bee` | Actions, links, focus rings (light) |
| `primary-light` | `#8b89f6` | Primary accents (dark mode) |
| `translation` | `#806F3A` | Translated text (light) |
| `translation-light` | `#D6BB7E` | Translated text (dark) |
| `background-light` | `#F8FAFF` | App background (light) |
| `background-dark` | `#0f172a` | App background (dark) |
| `card-light` | `#FFFFFF` | Card surface (light) |
| `card-dark` | `#1f2937` | Card surface (dark) |
| `success` | `#047857` | Success states |
| `danger` | `#dc2626` | Error/destructive states |

### POS Badge Colors (`POS_COLORS`)

| Code | Light | Dark |
|---|---|---|
| `zn` | bg-blue-100/60, text-blue-700/55 | bg-blue-900/20, text-blue-300/45 |
| `ww` | bg-red-100/60, text-red-700/55 | bg-red-900/20, text-red-300/45 |
| `bn` | bg-green-100/60, text-green-700/55 | bg-green-900/20, text-green-300/45 |
| `bw` | bg-orange-100/60, text-orange-700/55 | bg-orange-900/20, text-orange-300/45 |
| `vz` | bg-purple-100/60, text-purple-700/55 | bg-purple-900/20, text-purple-300/45 |
| `lidw` / default | bg-slate-100/60, text-slate-700/55 | bg-slate-800/50, text-slate-300/40 |

### Sidebar Button Tones

| Tone | Light | Dark |
|---|---|---|
| fail | bg-red-100, text-red-700 | bg-red-900/30, text-red-200 |
| hard | bg-amber-100, text-amber-700 | bg-amber-900/30, text-amber-200 |
| success | bg-emerald-100, text-emerald-700 | bg-emerald-900/30, text-emerald-200 |
| easy | bg-green-200, text-green-800 | bg-green-900/40, text-green-200 |
| neutral | bg-white, text-slate-800 | bg-slate-900/60, text-slate-200 |

### Accessibility

See `docs/accessibility-colors.md` for full WCAG AA contrast table.

## 2. Typography

| Role | Mobile | Desktop | Weight | Line-height |
|---|---|---|---|---|
| Headword (W->D) | text-3xl (30px) | text-4xl / lg:text-5xl (36/48px) | bold | tracking-tight |
| Definition prompt (D->W) | text-xl (20px) | text-3xl (30px) | medium | 1.4 |
| Revealed definition (W->D) | text-xl (20px) | text-2xl (24px) | medium | 1.4 |
| Context | text-base (16px) | text-base (16px) | medium | default |
| Example sentences | text-lg (18px) | text-lg (18px) | normal italic | 1.4 |
| Translation inline | 14-17px | 15-19px | medium-semibold italic | 1.25-1.4 |
| POS badge | 10px | 12px (xs) | semibold | default |
| Debug stats | text-sm (14px) | text-sm (14px) | medium | default |
| Font family | Lexend (display) | — | — | — |

### Translation Variants

| Variant | Mobile | Desktop | Weight |
|---|---|---|---|
| `headword` | 17px | 19px | semibold, tracking-tight |
| `definition` | 15px | 17px | semibold, tracking-wide |
| `supporting` | 14px | 15px | medium, tracking-wide |

## 3. Spacing System

### Card Container

| Property | Mobile | Desktop |
|---|---|---|
| Padding | `p-5` (20px) | `p-8` (32px) |
| Border radius | `rounded-3xl` (24px) | same |
| Shadow | `shadow-lg` | same |
| Content inner padding | `px-3` (12px) | `px-4` (16px) |
| Scroll top padding | `pt-10` (40px) | `pt-12` (48px) |
| Scroll bottom padding | `pb-10` (40px) | same |

### Card Frame (TrainingScreen.tsx)

| Property | Mobile | Desktop |
|---|---|---|
| Min height | 360px | 400px |
| Height | `clamp(360px, 55dvh, 520px)` | auto (aspect ratio) |
| Max height | 520px | — |
| Aspect ratio | — | 16/10 |
| Max width | `max-w-3xl` (768px) | same |

### Internal Spacing

| Property | Value |
|---|---|
| Header bottom margin | `mb-8` (32px) |
| Between meanings | `gap-8` (32px) |
| Between sections within meaning | `gap-3` (12px) |
| Between examples (W->D hints) | `gap-5` (20px) |
| Between examples (D->W revealed) | `gap-5` (20px) |
| Idiom section top margin (W->D) | `mt-2` (8px) |
| Idiom section top margin (D->W) | `mt-2` (8px) |
| Examples top margin (D->W revealed) | `mt-3` (12px) |
| Hint section bottom margin | `mb-4` (16px) |

### Badge Gutter

| Property | Mobile | Desktop |
|---|---|---|
| Width | `w-12` (48px) | `w-14` (56px) |
| Badge size | `w-7 h-7` (28px) | same |
| Badge-to-content gap | `gap-4` (16px) | `gap-6` (24px) |

### Example Separator Bar

| Property | Value |
|---|---|
| Size | `h-[1em] w-[2px]` |
| Top offset | `mt-[0.45em]` |
| Bar-to-text gap | `gap-3` (12px) |

### Top Controls

| Property | Mobile | Desktop |
|---|---|---|
| Position | `top-4 right-4` (16px) | `top-6 right-6` (24px) |
| Button size | `h-8 w-8` (32px) | same |
| Control gap | `gap-2` (8px) | same |

## 4. Card Layout Zones

### W->D (Word-to-Definition) — Reference Layout

```
┌─────────────────────────────────────┐
│ [Tip][T][🔊]          [POS badge][i]│  ← absolute positioned
│                                     │
│           het woord                 │  ← center, full width
│         (translation)               │
│                                     │
│  [1]  [context text]                │  ← badge gutter + left-aligned
│       | example sentence            │
│         (translation)               │
│                                     │
│  [1]  definition text               │  ← badge gutter + left-aligned
│         (translation)               │
│       | idiom expression            │
│         (translation)               │
│                                     │
│      src:learning  int:2.5d  S:0.8  │  ← center, debug stats
└─────────────────────────────────────┘
```

### D->W (Definition-to-Word) — Fixed Layout

```
┌─────────────────────────────────────┐
│ [T][🔊]               [POS badge][i]│  ← absolute positioned
│                                     │
│  [1]  definition text               │  ← badge gutter + left-aligned
│ [idiom] (translation)               │
│                                     │
│  ─ ─ ─ ─ revealed ─ ─ ─ ─ ─ ─ ─ ─ │
│                                     │
│           het woord                 │  ← FULL-WIDTH centered (like W->D header)
│         (translation)               │
│                                     │
│  [ ]  [context text]                │  ← gutter spacer + left-aligned
│       idiom expression  [idioom]    │  ← left-aligned + badge
│       | explanation                 │
│       | example sentence            │  ← separator bar + left-aligned
│         (translation)               │
│                                     │
│      src:learning  int:2.5d  S:0.8  │  ← center, debug stats
└─────────────────────────────────────┘
```

**Key structural principle:** In both modes, the headword is centered across the full card width (not inside the gutter layout). Below the headword, content uses the badge gutter (`w-12 md:w-14`) on the left with a `flex-1` column for left-aligned content (context, definitions, idioms, examples).

## 5. Component Catalog

### POS Badge
- Border radius: `rounded-lg`
- Border: yes
- Padding: `px-2 py-1` mobile, `px-3 py-1.5` desktop
- Font: `text-[10px]` mobile, `text-xs` desktop, `font-semibold tracking-wide`

### Number Badge
- Size: `w-7 h-7` (28px)
- Shape: `rounded-full` (or `rounded-md` for last meaning)
- Color: `bg-blue-100 text-blue-600` / `dark:bg-blue-900/40 dark:text-blue-300`
- Font: `text-sm font-bold`

### Idiom Badge
- Shape: `rounded-md`
- Color: `bg-purple-100 text-purple-600` / `dark:bg-purple-900/30 dark:text-purple-300`
- Padding: `px-1.5 py-1`
- Font: `text-[9px] font-bold uppercase tracking-wide`

### Control Buttons
- Size: `h-8 w-8` (32px)
- Shape: `rounded-full`
- Border: `border border-slate-200`
- Background: `bg-white/80 backdrop-blur-sm`
- Dark: `dark:border-slate-700 dark:bg-slate-800/80`

### Separator Bar
- Size: `w-[2px]` width, `h-[1em]` height
- Shape: `rounded`
- Color: `bg-slate-400 dark:bg-slate-500`

### Scroll Fade Overlays
- Top: `h-16`, gradient `from-card-light via-card-light/70 via-40% to-transparent`
- Bottom: `h-20`, same gradient reversed
- Chevron hint: `w-5 h-5`, `animate-pulse`, `text-slate-500/60`

### Animations
- Card reveal: `animate-in fade-in slide-in-from-bottom-2 duration-300`

## 6. Responsive Breakpoints

| Breakpoint | Min width | Key changes |
|---|---|---|
| Default (mobile) | 0 | Base sizing |
| `md:` (tablet+) | 768px | Card padding 20→32px, gutter 48→56px, gap 16→24px, fonts scale up |
| `lg:` (desktop) | 1024px | Headword → text-5xl (48px) |
| Card frame max | — | `max-w-3xl` (768px) content column, outer container varies |
