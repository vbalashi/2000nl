# Search/Lists Multisource UX Evidence - 2026-05-26

## Capture Context

- App URL: `http://localhost:3100/dev/test-login?redirectTo=/`
- Capture method: Playwright fallback, because Browser/Chrome MCP was blocked by the shared Chrome profile.
- Data source: live local Supabase/Postgres.
- Local DB health check: `postgres|postgres|172.18.0.2|5432|17389`
- Viewports: desktop `1440x900`, mobile `390x844`.

## Screenshot Inventory

| File | View | State |
| --- | --- | --- |
| `screenshots/01-desktop-training-main.png` | Desktop | Main training screen with current footer summary. |
| `screenshots/02-mobile-training-main.png` | Mobile | Main training screen. |
| `screenshots/03-search-exact-headword-huis.png` | Desktop | Dictionary search for `huis`, exact-headword flow. |
| `screenshots/04-search-no-results.png` | Desktop | Dictionary search no-results state. |
| `screenshots/05-list-browsing-listinhoud.png` | Desktop | Lists tab in `Lijstinhoud` mode. |
| `screenshots/06-list-dictionary-mode.png` | Desktop | Lists tab in `Woordenboekentries` mode with explicit source label. |
| `screenshots/07-settings-global-preferences.png` | Desktop | Global settings/preferences cleanup. |
| `screenshots/08-entry-detail-actions.png` | Desktop | Entry detail with action hierarchy. |
| `screenshots/09-mobile-lists.png` | Mobile | Lists tab mobile layout. |
| `screenshots/10-mobile-settings.png` | Mobile | Settings tab mobile layout. |

## Caveats

- These captures use the live local DB, not mocked multi-source fixtures.
- The local dataset currently exposes one primary VanDale dictionary source in the UI; multi-dictionary duplicate-headword and multi-language/source-switch screenshots are deferred until the A2 fixture plan is populated.
- Example-only and definition-only ranked search states were not separately forced with fixtures in this package; the exact and no-result paths were captured against live data.
- User-list duplicate-add, successful-add, one-off train-next success/failure, and active-training-list switch states require seeded user-list/membership fixtures and were not captured in this live pass.
