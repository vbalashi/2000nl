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
| `screenshots/11-btrack-desktop-training-nl.png` | Desktop | Fixture-backed Dutch training scope. |
| `screenshots/12-btrack-mobile-training-en.png` | Mobile | Fixture-backed English training scope. |
| `screenshots/13-btrack-search-en-core-bank.png` | Desktop | Fixture-backed `bank` search scoped to `EN Core Test`. |
| `screenshots/14-btrack-lists-en.png` | Desktop | Fixture-backed English list browsing. |
| `screenshots/15-btrack-lists-fr.png` | Desktop | Fixture-backed French list browsing. |

## Caveats

- These captures use the live local DB, not mocked multi-source fixtures.
- The local dataset currently exposes one primary VanDale dictionary source in the UI; multi-dictionary duplicate-headword and multi-language/source-switch screenshots are deferred until the A2 fixture plan is populated.
- Example-only and definition-only ranked search states were not separately forced with fixtures in this package; the exact and no-result paths were captured against live data.
- User-list duplicate-add, successful-add, one-off train-next success/failure, and active-training-list switch states require seeded user-list/membership fixtures and were not captured in this live pass.
- Screenshots `11` through `15` are fixture-backed B-track captures against
  `db/test-fixtures/search_multisource.sql` with seeded `user_training_scopes`;
  screenshots `01` through `10` remain the earlier live local dataset captures.

## Fixture Smoke

The B-track fixture baseline is `db/test-fixtures/search_multisource.sql`.
After applying the current DB migrations, load it with:

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f db/test-fixtures/search_multisource.sql
```

Local smoke on 2026-05-26 verified:

- fixture languages: `en,fr,nl`;
- fixture dictionary counts: `en-test-core:10`, `en-test-extra:10`,
  `fr-test-core:10`, `fr-test-extra:10`, `nl-test-lexicon:10`;
- duplicate fixture headword `bank` exists in `en` and `nl`;
- conjugation/inflection forms exist for `courir`, `lopen`, and `run`.

The scoped search RPC was also checked under the local authenticated test user:
`bank` filtered to `nl` returned only `nl` rows, `bank` filtered to `en`
returned only `en` rows, and `fr` dictionary sources returned
`fr-test-core` plus `fr-test-extra`.

## B-Track Targeted UI And Service Validation

Local checks on 2026-05-26:

```bash
cd apps/ui && npm run typecheck
cd apps/ui && npm test -- tests/useTrainingActiveList.test.tsx tests/TrainingScreen.test.tsx tests/trainingService.listsPreferences.test.ts tests/trainingService.mappers.test.ts
```

Results:

- `tsc --noEmit` passed.
- 69 targeted Vitest tests passed.
- Coverage includes per-language active training scope wrappers, available
  languages/sources wrappers, language/source search filters, footer training
  language switching without mutating default `Leertaal`, full-scope
  restoration for list/scenario/card filter/modes/new-review ratio, and search
  scope switching without mutating active training scope.

Follow-up B5 validation after mixed-list grouping:

```bash
cd apps/ui && npm run typecheck
cd apps/ui && npm test -- tests/useTrainingActiveList.test.tsx tests/TrainingScreen.test.tsx tests/trainingService.listsPreferences.test.ts tests/trainingService.mappers.test.ts
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -v ON_ERROR_STOP=1 -f db/migrations/064_multilanguage_scope_rpcs.sql
cd apps/ui && FSRS_TEST_DB_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' npm test -- tests/fsrs/*.test.ts
```

Results:

- `tsc --noEmit` passed.
- 69 targeted Vitest tests passed.
- Reapplying migration `064_multilanguage_scope_rpcs.sql` passed against the
  local Supabase Postgres.
- FSRS/RPC integration passed: `37` tests across
  `tests/fsrs/fsrsRpc.test.ts` and `tests/fsrs/fsrsParity.test.ts`.
- Transactional SQL smoke inserted a temporary user list containing both `nl`
  and `en` fixture entries, called `get_available_word_lists(user, 'nl',
  'user')`, verified the list was returned with `is_mixed_language = true`, and
  rolled the transaction back.
- Fixture-backed desktop browser smoke first exposed a stale-list regression:
  after switching `English -> Nederlands`, the footer could show `Nederlands`
  while keeping `EN Core Test` as the active list. The hook now invalidates stale
  list fetches and clears language-local list state on language changes; the
  regression is covered by the footer language switching test.
- A post-fix Playwright rerun on port 3100, after seeding `user_training_scopes`
  for the local dev user, verified `nl -> en -> nl` restoration:
  `Nederlands · NL Testlexicon`, `English · EN Core Test`, then
  `Nederlands · NL Testlexicon` again. No console errors or warnings were
  reported.
- The same Playwright fallback smoke verified `Zoekbereik` with fixture search:
  `bank` in Dutch returned Dutch dictionary rows, `bank` in English all sources
  returned both `EN Core Test` and `EN Extra Test`, and selecting `EN Core Test`
  removed `EN Extra Test` from the result rows while leaving the current
  training summary unchanged.
- A mobile Playwright fallback smoke at `390x844` verified full visible
  `nl -> en -> nl` restoration: `Nederlands · NL Testlexicon · Begrip · Nieuw +
  herhaling`, `English · EN Core Test · Luisteren · Alleen herhaling`, then
  `Nederlands · NL Testlexicon · Begrip · Nieuw + herhaling` again. The clean
  rerun reported no console errors or warnings.
- Fixture-backed list browsing was checked by loading the Lists tab with
  English and French as the start language. English showed `EN Core Test` and
  `EN Extra Test` without `NL Testlexicon`; French showed `FR Core Test` and
  `FR Extra Test` without `NL Testlexicon`. Both runs reported no console
  errors or warnings.
- Fixture-backed screenshots `11` through `15` were captured with Playwright
  fallback. `sips` verified expected dimensions: desktop captures are
  `1440x900`, and the mobile capture is `390x844`. The capture run reported no
  console errors or warnings.

Browser smoke after the training/default language split used the local wrapper:

```bash
scripts/ui-local-dev.sh --port 3102
curl -sS 'http://localhost:3102/api/health?deep=1'
```

The health response was `status: ok` with `database.target: local`.
Chrome DevTools smoke via
`http://localhost:3102/dev/test-login?redirectTo=/` verified the footer
`Huidige training` summary, the expanded footer language/list controls, the
settings `Huidige training` summary, and the `Standaard leertaal` default
control. No console errors, warnings, or issues were reported during this smoke.
The local browser dataset exposed only `Nederlands` as a normal footer training
language option in that session, so full browser `nl -> en -> nl` training
switch evidence still requires fixture training lists for English/French or a
seeded per-language training-list setup.

## B-Track Completion Audit

Final audit on 2026-05-26:

- B0 product decisions are recorded in the roadmap and implemented with DB/RPC
  scope state rather than client-only preferences.
- B1 fixture baseline is reproducible through
  `db/test-fixtures/search_multisource.sql`; migration reapply and fixture load
  passed locally.
- B2 available language/source APIs are covered by RPCs, service wrappers, UI
  controls, mapper tests, and fixture/browser evidence.
- B3 active training scope is stored per language in `user_training_scopes` and
  now covers list, scenario, card filter, enabled modes, and new/review ratio.
- B4 backend search accepts `languageCode` and `dictionaryIds`; tests and
  browser smoke prove `bank` language/source filtering.
- B5 list filtering is language-scoped, mixed lists are marked separately, and
  new list creation writes language metadata intentionally.
- B6 the footer exposes `Huidige training` with language/list/scenario/filter
  controls and restores `nl -> en -> nl` on desktop and mobile.
- B7 dictionary search exposes independent `Zoekbereik` controls and does not
  mutate current training scope.
- B8 settings labels global language as `Standaard leertaal` and shows current
  training as status/link rather than the main switch.
- B9 SQL/RPC, unit/service, desktop browser, mobile browser, list-browsing, and
  fixture-backed screenshot QA are complete for this track.
