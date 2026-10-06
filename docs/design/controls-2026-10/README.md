# Controls review, 2026-10-06

Tracking: [#596](https://github.com/vbalashi/2000nl/issues/596).
Canonical decisions: [control-system.md](../../intent/control-system.md).

- `controls.html`: standalone controls playground with per-family geometry/background controls and Copy settings.
- `controls.fragment.html`: editable inline source.
- `session-builder.html`: source-backed production-component review; real Exercises/Filters/Session bodies, light/dark, editable name, transparent 28 px choices, real save-as/delete dialogs with local callbacks.
- `session-builder.fragment.html`: editable inline source.
- `approved-defaults.json`: owner-selected defaults plus the adaptive learning-language rule.

Open either standalone HTML directly in a browser. No Next server, account or database is needed. Initial offline interaction works; fonts fall back when offline. Keep the fragment and standalone document together. The standalone document includes the preview runtime and state bridge; edits to the fragment require rebuilding its standalone sibling with the visualize render helper or updating the embedded fragment. Never use these files as production components.

The active-language count selector is a scenario control, not product UI. It exercises one, two, three, four and six active languages; paused languages are outside this active list. The prototype uses sample English language names. Production must measure localized labels and retain catalog identities/statuses.

Validated: menu selection and returning to a remembered language, translation Off/on, settings language overflow selection, 1–4 visible languages without overflow on desktop, responsive overflow, Library action height28, copying settings with manual fallback, Session Builder name edit and save menu, light/dark and 320 px layout. Production palette coverage and full application behavior remain for implementation.

The schematic checkbox-based Session Builder has been replaced. See [source/README.md](source/README.md) for the source map, rebuild commands, fixture boundaries and repeatable validation.

## Start-first footer comparison (pending owner choice)

Run the local UI and open `/dev/controls-standard?variant=outline`.
The prototype uses the real Builder with in-memory callbacks; changes to this
comparison do not alter the production footer. Use the Actions selector or the
bottom arrows (keyboard left/right) to compare:

- `current`: published layout, Save and Start at 44 px.
- `quiet`: Start first; trash left and transparent Save/menu right, 28 px.
- `outline`: same ordering, compact Save/menu with one neutral outline, 28 px.
- `wide`: same ordering, wide outlined Save/menu, 34 px.

Screenshots: `footer-a-quiet.png`, `footer-b-outline.png`, `footer-c-wide.png`,
`footer-b-desktop.png`, `footer-b-mobile-ru.png`. Outline was checked at 320 px
in Russian with the Save-as menu open: no page/footer overflow. Desktop at
1280 px was inspected. Decision remains open; production rollout requires a
separate selected-variant change.
