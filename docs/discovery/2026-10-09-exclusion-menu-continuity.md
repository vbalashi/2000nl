# Open training exclusion menu: periodic flicker (#638)

Owner: current Codex chat. Layer: UI shared ActionMenu, no scheduler changes.
Branch `codex/638-exclusion-menu-flicker`, base `98896ded1f43`.

The owner reported a periodic flash while leaving exclusion choices open.
Previous #519/#523 evidence established authority-poll disabled-button dimming;
that repair preserved button opacity but did not cover open native popovers.

## Reproduction

`npx playwright test playwright/tests/training-exclusion-continuity.spec.ts --workers=1`
uses the real Training controller with mocked authenticated RPC/lookup data.
Two delayed authority checks triggered through the same focus-validation path
produced repeat `popover-open` events and two new entry animations while the
same menu node remained connected. Original test failed in 2.1 seconds. This is
a visible animation restart, not an inference based on React render counts.

Ranked predictions: availability changes restart popover lifetime; changed close
callbacks restart lifetime; geometry recalculation changes focus/position.
The lifetime effect depended on item signatures including disabled state. Each
background ownership check changed disabled false→true→false, running cleanup
hidePopover followed by showPopover. The CSS 130ms opacity/translation entry
animation therefore replayed. Changing callbacks could cause the same lifecycle
restart in other callers of the shared menu.

## Correction

Keep popover lifetime tied to its anchor. Event listeners call the latest close
callback via a ref. Content changes remeasure geometry separately; availability
updates preserve the open popover. Native disabled actions and authority polling
remain intact. Focus behavior is covered alongside visible continuity.

## Release limits

No production write or deployment. Browser evidence uses mocked responses and
Chromium, not physical Safari. #637 safe-area repair remains a separate PR.
Preserve this issue checkout pending review/release; sync reference main and
retire only after integration, release checks and evidence/owner review.

## Final verification

- 11 browser checks passed in 59.4s with no source edits during the run.
  The new idle test held the menu open on the answer for 42.3 seconds,
  crossing two real 20-second authority polls: no menu detachment, popover
  reopen or entry-animation replay; selection/focus and answer side retained.
- The accelerated focus path checked native disabled fences during each read.
  Native disabling blurs the selected menu button; a stricter initial run
  exposed lost focus even after animation replay was fixed. The correction
  remembers the focused menu item and restores it when it is enabled again,
  only when focus has fallen to body. It does not steal another control's focus.
- Existing mobile exclusion checks passed in English/Dutch/Russian; previous
  idle opacity, offline gates and finite-target progression checks passed.
  Word-panel sequences passed at 320/390/1024px.
- 17 unit/component checks passed, including disabled action rejection,
  current close callback delivery and content-change focus continuity.
  The first unit harness run lacked JSDOM popover API mocks; adding temporary,
  restored mocks repaired the harness rather than changing runtime behavior.
- Typecheck passed. Lint passed with the existing handlePlayAudio effect
  dependency warning. No debug instrumentation added to production components.

The failing browser test before repair captured two repeated entry animations;
after repair the same real controller path passes. This confirms the reproduced
mechanism and covers the reported idle scenario locally. Physical iPhone and
the owner's original production session are not claimed as verified.
