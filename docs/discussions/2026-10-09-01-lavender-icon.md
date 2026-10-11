# Lavender icon revision

Accepted by owner after prototype comparison: fixed Lavender two-line icon, real Inter 400. On 512px source: 2000 size 154 centered at y=180; lowercase nl size 186 centered at y=332. Background #191720, digits #f0eaf7, letters #c2a8e2, full opacity, no blending. Clear line gap avoids the generated mock’s apparent clipped l.

Implementation: icon assets v3 for any/maskable/monochrome/Apple and favicon. OS applies mask. Startup screen and existing fixed iOS splash remain unchanged. Production rollout requested for phone review.

Validation found the exact composition reaches radius 213.85px, beyond the conservative 204.8px maskable circle. Android maskable source alone scales the complete centered mark by 0.95, preserving proportions and bringing it within safety bounds. Any/Apple retain exact approved dimensions.
