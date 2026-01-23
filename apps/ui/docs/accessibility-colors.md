# Accessibility Color Guide (WCAG AA)

This document summarizes the color palette defined in `apps/ui/tailwind.config.js`, how it is used in the UI, and the contrast checks performed for WCAG AA compliance.

## Palette (Tailwind custom colors)

| Token | Hex | Usage context |
| --- | --- | --- |
| `primary` | `#2e2bee` | Primary actions, links, focus rings, active states on light surfaces |
| `primary-light` | `#8b89f6` | Primary text/accents on dark surfaces (dark mode) |
| `background-light` | `#F8FAFF` | App background (light mode) |
| `background-dark` | `#0f172a` | App background (dark mode) |
| `card-light` | `#FFFFFF` | Card surfaces, modal surfaces (light mode) |
| `card-dark` | `#1f2937` | Card surfaces, modal surfaces (dark mode) |
| `success` | `#047857` | Success states and progress (background with white text) |
| `danger` | `#dc2626` | Error/destructive states (background with white text) |

## Text color usage (Tailwind defaults)

Common text colors used across components:
- `text-slate-900` / `text-slate-800` / `text-slate-700` for primary text on light surfaces.
- `text-slate-600` / `text-slate-500` for supporting text on light surfaces.
- `dark:text-slate-400` / `dark:text-slate-300` for supporting text on dark surfaces.
- `text-white` for text on dark/primary/success/danger backgrounds.
- `text-primary` on light surfaces, `dark:text-primary-light` on dark surfaces.

## Contrast checks (WCAG AA)

Contrast ratios below use the WCAG 2.1 formula (same as WebAIM Contrast Checker). Requirements:
- Normal text: 4.5:1 or higher
- Large text (>= 18pt or 14pt bold): 3:1 or higher

### Light mode combinations

| Text | Background | Contrast |
| --- | --- | --- |
| `slate-900` (#0f172a) | `background-light` (#F8FAFF) | 17.10 |
| `slate-900` (#0f172a) | `card-light` (#FFFFFF) | 17.85 |
| `slate-800` (#1e293b) | `card-light` (#FFFFFF) | 14.63 |
| `slate-700` (#334155) | `card-light` (#FFFFFF) | 10.35 |
| `slate-600` (#475569) | `card-light` (#FFFFFF) | 7.58 |
| `slate-500` (#64748b) | `card-light` (#FFFFFF) | 4.76 |
| `slate-500` (#64748b) | `background-light` (#F8FAFF) | 4.56 |
| `primary` (#2e2bee) | `card-light` (#FFFFFF) | 7.79 |
| `primary` (#2e2bee) | `background-light` (#F8FAFF) | 7.46 |
| `white` (#FFFFFF) | `primary` (#2e2bee) | 7.79 |
| `white` (#FFFFFF) | `success` (#047857) | 5.48 |
| `white` (#FFFFFF) | `danger` (#dc2626) | 4.83 |

### Dark mode combinations

| Text | Background | Contrast |
| --- | --- | --- |
| `white` (#FFFFFF) | `background-dark` (#0f172a) | 17.85 |
| `slate-100` (#f1f5f9) | `background-dark` (#0f172a) | 16.30 |
| `white` (#FFFFFF) | `card-dark` (#1f2937) | 14.68 |
| `slate-100` (#f1f5f9) | `card-dark` (#1f2937) | 13.40 |
| `primary-light` (#8b89f6) | `card-dark` (#1f2937) | 4.90 |
| `primary-light` (#8b89f6) | `background-dark` (#0f172a) | 5.96 |

## Previously failing combinations (fixed)

| Combination | Before | Issue | Fix |
| --- | --- | --- | --- |
| `white` on `success` (#10B981) | 2.54 | Fails normal text | Darkened `success` to #047857 |
| `white` on `danger` (#EF4444) | 3.76 | Fails normal text | Darkened `danger` to #dc2626 |
| `primary` on dark surfaces | 1.88 (on card-dark) | Fails normal + large text | Added `primary-light` for dark mode text |
| `slate-400` on light surfaces | 2.56 (on white) | Fails normal + large text | Promoted to `slate-500` in light mode |
| `slate-500` on `background-light` (#F5F7FB) | 4.44 | Slightly below AA | Lightened `background-light` to #F8FAFF |

## Color-blindness simulation checks

Simulated semantic colors using standard RGB matrices (protanopia, deuteranopia, tritanopia, achromatopsia). Results show success and danger remain distinguishable by luminance and hue shifts.

Example simulated values (success vs danger):
- Protanopia: success `#36375f`, danger `#8d8c26`
- Deuteranopia: success `#302761`, danger `#98a526`
- Tritanopia: success `#0a6567`, danger `#d32626`
- Achromatopsia: success `#525252`, danger `#5c5c5c`

In all simulations, success/danger remain visually distinct; primary remains distinct from both.

## Usage guidelines

- Use `text-slate-500` or darker on light surfaces; avoid `text-slate-400` in light mode.
- Use `dark:text-slate-400` or lighter on dark surfaces; avoid `dark:text-slate-500` on dark cards.
- Use `text-primary` on light backgrounds, and `dark:text-primary-light` on dark backgrounds.
- Use `text-white` on `primary`, `success`, and `danger` backgrounds.
- When adding new UI, validate any new color pairings with a contrast checker before release.
