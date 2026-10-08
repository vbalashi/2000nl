# Icon Source

These icons are generated locally using ImageMagick (not committed as a script yet).

Design:
- Background: `#F8FAFF`
- Primary: `#2e2bee`
- Text: `#0f172a`
- Font: Noto Sans (Black)

Files:
- `icon-512.png`: Any-purpose icon
- `icon-512-maskable.png`: Maskable icon with additional safe-zone padding
- `icon-192.png`: Derived from `icon-512.png`
- `apple-touch-icon.png`: Derived from `icon-512.png`

## Approved v2 (2026-10-08, #630)
Full-bleed #202124. Inter Medium 500, ivory #e6e6e5 digits, lavender #c2a8e2 nl.
Centered wordmark at 132 source pixels on a 512px canvas, per owner approval.
Fits the Pixel circle and iPhone preview; exceeds Android's conservative 40% radius safe zone, so unusual masks may crop its edges.
192/512 any, 512 maskable, 180 Apple touch, transparent white 512 monochrome, multi-size favicon.
Versioned paths. Renderer and source font: scripts/pwa-assets. OS owns the shape.
