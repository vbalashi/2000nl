# Saved Session Builder actions — #575

2026-10-03: three Playwright browser scenarios passed: English1280×900, Russian390×844 and Russian320×740. Reused approved local3100 runtime (localDB208 healthy); account catalog, availability and saved-recipe writes were mocked with deterministic authenticated fixtures. No real account writes or training answers.

Verified fullscreen editor and inline name; Update directly persists same ID without a naming modal; Save as opens via keyboard-accessible split dropdown, uses separate name and new ID, preserves original; deleting requires confirmation with Cancel initially focused and deletes only the copy. Save-as dismissal restores focus to visible dropdown. Menu and modal remain inside viewport. Trash is left of Update; dropdown right. Controls are at least32px wide; Update height at most62px; footer/main have no horizontal overflow.

Initial RU390/RU320 captures show a real footer regression: split action squeezed Update into fragments, enlarging the footer. Root applied a scoped≤430px two-row editing footer with a nonbreaking Update label. The regression check and all three scenarios then passed. Final RU320 footer was visually inspected; Update is one line, Start is a separate full-width row. Existing new-training save flow was not changed by this editing-only footer rule.

Test: apps/ui/playwright/tests/training-builder-actions-575.spec.ts. Initial-* images are pre-fix evidence; desktop-en/ru390/ru320 images and geometry JSON are final.
