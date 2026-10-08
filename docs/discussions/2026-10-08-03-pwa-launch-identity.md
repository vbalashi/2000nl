# PWA launch identity and cosmetic appearance cache

Date: 2026-10-08. Source: owner's Pixel screenshots and this design conversation. Issue: #630.

Accepted: single-line 2000nl using production Inter, 52px / 400 on app startup, accented lowercase nl, no visible Preparing training subtitle. Exactly three proportional dots softly flow in brightness; no fake progress percentage. Keep a localized accessible status and reduced-motion fallback. Error/retry UI remains visible.

Accepted icon: first concept, full single-line 2000nl, ivory digits and lavender nl on full-bleed graphite. Inter 500 for small launcher legibility. Owner then requested roughly 12% larger icon text in the live mask prototype. Use at most 76% canvas width. Keep all meaningful pixels in the standard maskable safe circle; never pre-round the source asset. OS owns the shape. A monochrome asset is supplied, but exact themed launcher behavior remains platform-dependent.

Accepted appearance: neutral light/dark system fallback when no valid cosmetic cookie exists. A confirmed profile load or successful palette save updates the device hint. The hint changes startup colors only; it never substitutes for profile readiness, identity, preferences, or training state. Mode follows the existing theme owner when mounted. Storage failures must not block startup.

OS splash limitation: Android generates the pre-page splash from its installed manifest and cannot read the page cookie for each launch. iOS uses startup-image assets. These use a fixed neutral graphite background; the subsequent app screen can use the cached profile colors. Do not promise dynamic native splash or instant installed-icon refresh. Existing installs may retain old artwork until OS/browser refresh or reinstall.

Status: design accepted, implementation in issue checkout; not released. Profile data, auth and scheduler contracts unchanged.

## Final sizing and release approval
Owner selected 132 source pixels, Inter Medium 500 for launcher icons and authorized push, PR merge and reference synchronization. Export matches the unclamped prototype. This fits the displayed circular/iPhone masks but exceeds Android's conservative guaranteed safe circle; unusual launcher masks may trim edges. Startup stays 52px / 400.
