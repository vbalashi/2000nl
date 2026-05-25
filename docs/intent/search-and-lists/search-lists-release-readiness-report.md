# Search Lists Release Readiness Report

Date: 2026-05-25
Status: Ready with caveats

## Scope

This QA pass covered the completed starter search/lists UX package as one
connected flow:

- global dictionary lookup;
- entry detail comprehension and learning-list membership;
- add-to-list duplicate and refresh behavior;
- membership inspection across curated and user-owned lists;
- list browsing versus active training scope;
- explicit training-scope selection;
- `Train dit woord` as a one-shot next-card override.

No new feature slice, DB/RPC change, or broad refactor was started.

## Environment And Validation

Automated validation passed:

- `cd apps/ui && npm test -- tests/WordDetailPanel.membership.test.tsx tests/TrainingScreen.test.tsx tests/useTrainingActiveList.test.tsx`
  - 35 tests passed across 3 files.
- `cd apps/ui && npm run typecheck`
  - passed.
- `cd apps/ui && npm run lint`
  - passed with no ESLint warnings or errors.

Browser smoke was attempted on `http://localhost:3100`:

- `scripts/db-local-supabase.sh all` completed successfully:
  - migrations and probes passed;
  - FSRS parity/RPC tests passed;
  - dictionary import populated 17,389 entries and linked 3,638 NT2 entries.
- `scripts/ui-local-dev.sh --port 3100` started the UI against local Supabase.
- `curl 'http://localhost:3100/api/health?deep=1'` returned `status: ok`,
  `database.target: local`, and `platformRpcContract.status: ok`.
- Login used the dev-only helper:
  `http://localhost:3100/dev/test-login?redirectTo=/`.
- Browser smoke then covered the full authenticated flow at
  `http://localhost:3100/`.

## Scenario Results

### 1. Global Lookup

Result: Pass.

Evidence:

- `TrainingScreen.test.tsx` verifies `Zoeken` opens the dictionary search
  surface with `Modus: woordenboeklookup`, `Woordenboeklookup: VanDale
  woordenboek`, and no stale `Alleen actieve lijst` copy.
- Browser smoke verified `Zoeken` opens with dictionary lookup as the default
  scope, not the active list.
- Browser smoke searched `huis`, selected the exact entry, and verified source,
  definitions, examples, learning-list membership, add-to-list, and train action
  were visible and understandable.
- Empty dictionary lookup states name the dictionary source search.
- `WordDetailPanel.membership.test.tsx` verifies entry detail shows `Bron`
  separately from learning-list membership, definition/example sections, empty
  membership state, add-to-list controls, and train action copy.

### 2. Add To List

Result: Pass.

Evidence:

- Duplicate add is blocked with disabled `Staat al in lijst` state.
- A successful add refreshes the membership section in place and calls the list
  reload hook.
- Browser smoke created `QA oefenlijst`, added `huis`, saw the editable
  user-owned membership refresh in place, and then saw duplicate add disabled.
- The add section states that adding to a learning list does not change the
  active training list.
- The focused membership test verifies `recordReview` is not called by add.
- Browser smoke verified active training scope remained `VanDale 2k`.

### 3. Membership Inspection

Result: Pass for implemented scope; deferred edit/navigation actions remain.

Evidence:

- Empty membership state is explicit: `Nog niet opgeslagen in een leerlijst.`
- Curated memberships render as `Curated leerlijst` and `Alleen-lezen`.
- User-owned memberships render as `Mijn lijst` and `Bewerkbaar`.
- Active training membership is labeled `Actieve trainingslijst`.
- Dictionary source is not shown as learning-list membership.
- Browser smoke verified an empty membership state on `überhaupt`.

Deferred:

- Opening a containing list directly from entry detail.
- Removing a user-owned membership from entry detail.

### 4. List Management

Result: Pass for starter scope separation.

Evidence:

- Passive list selection in `Lijsten` changes only the viewed list.
- Tests verify passive list browsing does not call active-list update, stats
  reload, or next-card fetch.
- List result copy distinguishes `LIJSTINHOUD`, `Filter: bekeken lijst`, and
  dictionary-wide lookup mode.
- Browser smoke switched from `VanDale 2k` to viewed list `QA oefenlijst`; the
  displayed contents changed to the one-word user list while active training
  scope stayed `VanDale 2k`.
- Browser smoke toggled the list toolbar from `Filter: bekeken lijst` to
  `WOORDENBOEKLOOKUP`, confirming the list-filter and dictionary-wide modes use
  distinct copy.

Deferred:

- Advanced sorting.
- Richer create/rename/delete UX states beyond existing controls.

### 5. Choose Training Scope

Result: Pass.

Evidence:

- Explicit `Maak actief voor training` changes the active training list.
- Footer list selector still changes active training scope.
- Effective training scope summary includes active list, scenario, card filter,
  and list policy.
- Settings repeats the effective scope from active training state, not from the
  viewed list.
- Browser smoke made `QA oefenlijst` active from the list surface while the
  viewed list remained `QA oefenlijst`, then used the footer selector to switch
  active training back to `VanDale 2k`.

### 6. Train One Entry

Result: Pass.

Evidence:

- `Train dit woord` queues the selected entry as the next card once.
- After grading that card, normal training resumes.
- Tests verify the one-shot override does not mutate list membership or active
  training scope.
- Browser smoke trained `auto` from entry detail, saw the
  `src:next-card-override` card and message that normal training would continue,
  answered it, and verified normal training resumed under `VanDale 2k`.

Deferred:

- A full one-entry quick-practice session with automatic return to the
  originating search/list context remains a future product decision.

## Bugs Fixed In This Pass

None. No small product regression was found that needed a code change during
this QA pass.

## Remaining Deferred Gaps

- Entry detail still does not open containing lists directly.
- Entry detail still does not remove user-owned memberships.
- List management still lacks the first defined advanced sort dimensions.
- `Train dit woord` is currently a one-shot next-card override, not a bounded
  one-entry practice session with automatic context return.

## Recommendation

Ready with caveats.

The implemented search/lists UX package is coherent at the covered component
and integration level, the requested automated validation passed, and the full
local authenticated browser smoke passed against a migrated local Supabase
runtime. The caveats are deferred product gaps rather than release-blocking
regressions in the completed starter package.
