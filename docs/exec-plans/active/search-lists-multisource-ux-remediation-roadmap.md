# Search Lists Multisource UX Remediation Roadmap

Date: 2026-05-26

## Goal

Turn the senior UX review into an ordered implementation map that can be handed
to agents one slice at a time.

The next pass must stabilize the product model before adding more language,
dictionary, list, or training controls. The core problem is not visual polish.
The UI currently blurs four separate objects:

- dictionary source;
- list;
- search scope;
- training session/settings.

This roadmap is intentionally dependency-driven. Do not ask agents to redesign
footer, settings, lists, and search independently without first defining the
source-of-truth model.

## Evidence

Primary review package:

- `review-packages/search-lists-ui-audit/2000nl-search-lists-ux-review-package-2026-05-26.zip`
- `review-packages/search-lists-ui-audit/current-screenshots/`
- `review-packages/search-lists-ui-audit/ux-followup-brief-2026-05-26.md`

Most important screenshots:

- `01-current-training-main.png`
- `02-current-training-detail-sidebar.png`
- `03-current-search-huis-results.png`
- `04-current-lists-default.png`
- `05-current-search-after-tab-return.png`
- `06-current-lists-dictionary-mode-toggle.png`
- `07-current-lists-training-settings.png`
- `08-current-global-settings.png`

## Non-Negotiable Product Model

Before broad UI work, the app needs explicit terms and precedence:

1. Dictionary source owns entries and dictionary metadata.
2. List is an entry collection used for training or organization.
3. Training session is what the learner is practicing now.
4. Preferences are defaults only.

Precedence:

1. One-off action, such as "train this word next".
2. Current session controls.
3. List defaults/recommendations.
4. Global preferences.

## Dependency Map

```mermaid
flowchart TD
  A["A0 Source-of-truth decision doc"] --> B["A1 Terminology and copy contract"]
  A --> C["A2 Multi-source fixture plan"]
  A --> D["A3 Search ranking/grouping contract"]
  A --> E["A6 Training footer IA"]
  A --> F["A7 Entry detail action hierarchy"]
  A --> G["A8 Lists IA and dictionary mode"]
  A --> H["A9 Global settings cleanup"]
  C --> D
  D --> I["A4 Search results implementation"]
  B --> I
  B --> E
  B --> F
  B --> G
  B --> H
  J["A5 Search state persistence"] --> K["A10 Current screenshot recapture"]
  I --> K
  E --> K
  F --> K
  G --> K
  H --> K
```

## Recommended Execution Order

### Phase 0: Model Before UI

Run these first.

1. A0 Source-of-truth decision doc.
2. A1 Terminology and copy contract.
3. A2 Multi-source fixture plan.
4. A3 Search ranking/grouping contract.

Do not start large UI reshuffles until A0 and A1 are complete.

### Phase 1: Low-Risk Product Fixes

Can start after A0/A1, with minimal visual risk.

5. A5 Search state persistence.
6. A4 Search results implementation, once A3 is ready.

### Phase 2: IA Surface Cleanup

Start after A0/A1 and preferably after A2 creates enough fixture pressure.

7. A6 Training footer IA.
8. A7 Entry detail action hierarchy.
9. A8 Lists IA and dictionary mode.
10. A9 Global settings cleanup.

### Phase 3: Review Evidence

11. A10 Current screenshot recapture and second reviewer package.

## Multilanguage Scope Implementation Plan

This is the implementation track for the scenario documented in
`docs/intent/search-and-lists/scenarios/switch-language-training-scope.md`.

The target user studies more than one language in parallel. They may open the
app in Dutch, switch to English, continue the English training list they used
before, search English dictionary sources, and later return to the Dutch list
without rebuilding either context.

### B0: Confirm Product Decisions

Status: planned.

Decisions to lock before code:

- Active training scope is remembered per `Leertaal`.
- Global `Leertaal` is a default, not always the current training session.
- Dictionary lookup scope defaults from current training language, but remains
  independent after the user changes search language/source.
- User lists are shown under their `primary_language_code` first. Mixed-language
  lists appear in a separate `Gemengde lijsten` group rather than silently under
  every language.
- Languages with no accessible dictionaries or training lists should not appear
  as normal selectable options. For now, do not show `de` unless German fixtures
  or production content exist.

Recommended decision:

- Store active training scope per language in a real table/RPC layer, not only in
  client state or `user_settings.preferences`. The user expectation is
  cross-device and training-critical.

### B1: Data And Fixture Baseline

Status: fixture seed exists; integration into automated validation still
planned.

Files:

- `db/test-fixtures/search_multisource.sql`
- `packages/ingestion/nl/nl-test-lexicon/data/words_content/`
- `packages/ingestion/en/en-test-core/data/words_content/`
- `packages/ingestion/en/en-test-extra/data/words_content/`
- `packages/ingestion/fr/fr-test-core/data/words_content/`
- `packages/ingestion/fr/fr-test-extra/data/words_content/`

Required changes:

- Keep the 50-entry local fixture as the canonical QA dataset for this track.
- Add fixture load instructions to the relevant runbook or evidence README.
- Add a narrow smoke query that proves:
  - `nl`, `en`, and `fr` languages exist;
  - every fixture dictionary has 10 entries;
  - duplicate headword `bank` appears in multiple languages/sources;
  - `run`, `courir`, and `lopen` preserve conjugation payloads.

Acceptance criteria:

- Local Supabase can apply migrations and `db/test-fixtures/search_multisource.sql`
  idempotently.
- The probe still passes after fixture load.
- A developer can reproduce the same fixture state without manual SQL editing.

### B2: Available Languages And Dictionary Sources API

Status: planned.

Purpose:

Stop hardcoding language options in UI controls. The UI should offer languages
and sources that are actually available to the current user.

Likely files:

- `db/migrations/`
- `apps/ui/lib/training/listService.ts`
- `apps/ui/lib/trainingService.ts`
- `apps/ui/lib/types.ts`
- `apps/ui/tests/trainingService.listsPreferences.test.ts`
- `apps/ui/tests/fsrs/fsrsRpc.test.ts`

Required changes:

- Add an RPC such as `get_available_learning_languages(p_user_id uuid)`.
- Return language code, display label, dictionary count, curated-list count,
  user-list count, and whether the language has training-eligible lists.
- Add an RPC such as
  `get_available_dictionary_sources(p_user_id uuid, p_language_code text)`.
- Return only dictionaries the user can read.
- Add service wrappers and mapper types.
- Replace hardcoded `nl/en/de/fr` UI arrays only after this API exists.

Acceptance criteria:

- Local fixture DB returns `nl`, `en`, and `fr`.
- `de` is absent unless content exists.
- Dictionary source picker for `en` returns `en-test-core` and `en-test-extra`.
- Dictionary source picker for `fr` returns `fr-test-core` and `fr-test-extra`.

### B3: Per-Language Active Training Scope

Status: planned.

Purpose:

Make `nl -> en -> nl` restore the correct active training list for each
language.

Likely files:

- `db/migrations/`
- `apps/ui/lib/training/listService.ts`
- `apps/ui/lib/training/useTrainingActiveList.ts`
- `apps/ui/lib/training/preferencesService.ts`
- `apps/ui/tests/trainingService.listsPreferences.test.ts`
- `apps/ui/tests/useTrainingPreferences.test.tsx`
- `apps/ui/tests/fsrs/fsrsRpc.test.ts`

Recommended data model:

- Add `user_training_scopes` keyed by `(user_id, language_code)`.
- Store:
  - `active_list_id`;
  - `active_list_type`;
  - `active_scenario`;
  - `card_filter`;
  - `modes_enabled`;
  - `new_review_ratio`;
  - timestamps.
- Keep `user_settings.language_code` as the default/current learning language
  for backward compatibility.
- Keep old `get_active_word_list` and `update_active_word_list` wrappers working
  by delegating to the current/default language.

RPC shape:

- `get_active_training_scope(p_user_id uuid, p_language_code text)`
- `update_active_training_scope(p_user_id uuid, p_language_code text, p_list_id uuid, p_list_type text, ...)`

Behavior:

- Switching learning language first reads that language's saved scope.
- If a saved valid scope exists, preselect it.
- If no saved scope exists, show the best training-eligible list as a
  suggestion, but require an explicit user action before persisting it.
- If the saved list no longer exists or is not accessible, clear that language's
  scope and ask for a new list.

Acceptance criteria:

- User can set Dutch active list, switch to English and set English active list,
  then switch back to Dutch and recover the Dutch list.
- Passive list browsing never changes the active training scope.
- Existing users keep their current active list after migration.

### B4: Search Scope Backend

Status: planned.

Purpose:

Make dictionary lookup explicitly search a language/source scope instead of all
accessible entries.

Likely files:

- `db/migrations/063_ranked_word_entry_search.sql` or a follow-up migration
- `db/migrations/bootstrap.sql`
- `docs/reference/api-functions/search-and-user.md`
- `apps/ui/lib/training/listService.ts`
- `apps/ui/lib/types.ts`
- `apps/ui/tests/trainingService.mappers.test.ts`
- `apps/ui/tests/fsrs/fsrsRpc.test.ts`

Required changes:

- Extend search filters with:
  - `languageCode`;
  - `dictionaryIds` or `dictionarySlugs`;
  - optional `sourceProvider` only if source grouping needs it.
- Prefer dictionary IDs internally. Slugs are useful for fixtures and URLs, but
  IDs avoid ambiguity across languages.
- Update the ranked search RPC to apply language and dictionary filters before
  ranking.
- Avoid ambiguous overloaded Supabase RPC signatures. Either replace/drop the
  old function signature explicitly or introduce a clearly named scoped function
  and migrate callers.
- Preserve existing result metadata:
  - dictionary name/slug/kind;
  - match group/rank/label;
  - matched text.

Acceptance criteria:

- Searching `bank` in `nl` does not return English or French fixture entries.
- Searching `bank` in `en` can return both English fixture dictionaries.
- Selecting only `en-test-core` hides `en-test-extra`.
- Empty language/source scope returns a clear empty state, not cross-language
  fallback.

### B5: List Language Filtering

Status: planned.

Purpose:

Make list browsing and list selection match the selected learning language.

Likely files:

- `db/migrations/033_available_word_lists_rpc.sql`
- `db/migrations/040_list_training_intent.sql`
- `apps/ui/lib/training/listService.ts`
- `apps/ui/components/training/wordlist/WordListTab.tsx`
- `apps/ui/components/training/wordlist/MobileListPickerSheet.tsx`
- `apps/ui/tests/TrainingScreen.test.tsx`

Required changes:

- Update `fetchUserLists(userId, languageCode)` to actually filter by language.
- Update or replace `get_available_word_lists` so user lists follow:
  - exact `primary_language_code` match first;
  - exact `language_code` match as fallback for legacy lists;
  - mixed-language lists in a separate group.
- Keep curated lists language-scoped.
- Ensure new list creation sets both `language_code` and
  `primary_language_code` intentionally.
- When changing list UI language, change only viewed list context unless the
  user explicitly chooses `Gebruik voor training`.

Acceptance criteria:

- English list picker does not show Dutch-only user lists as normal English
  options.
- Mixed-language fixture list appears under `Gemengde lijsten`.
- Creating a new English list makes it visible under English.
- Selecting a viewed list does not mutate active training scope.

### B6: Training Scope UI

Status: planned.

Purpose:

Expose language and list switching as a first-class training action, not as a
buried settings/list-management task.

Likely files:

- `apps/ui/components/training/FooterStats.tsx`
- `apps/ui/components/training/EffectiveTrainingScopeSummary.tsx`
- `apps/ui/components/training/TrainingScreen.tsx`
- optional new component:
  `apps/ui/components/training/TrainingScopePicker.tsx`
- `apps/ui/tests/TrainingScreen.test.tsx`

Required changes:

- Rename/shape the expanded footer control around `Huidige training` or
  `Trainingsbereik`.
- Show current `Leertaal` in the collapsed summary when more than one learning
  language exists.
- In the expanded scope picker, show:
  - learning language;
  - active training list;
  - training form/scenario;
  - card filter.
- When user selects another language:
  - load that language's saved scope;
  - preselect it if valid;
  - otherwise show available lists and require confirmation.
- Make the final action explicit, for example `Gebruik voor huidige training`.
- Keep global settings as defaults, not the main path to switch today's
  training.

Acceptance criteria:

- Desktop user can switch `nl -> en` from the training surface without opening
  global settings.
- Mobile user has the same flow in a drawer/sheet.
- UI clearly says whether a list is being viewed or used for training.
- User can return `en -> nl` and see the previous Dutch active training list.

### B7: Dictionary Search UI Scope

Status: planned.

Purpose:

Make search language/source visible and editable without changing training.

Likely files:

- `apps/ui/components/training/wordlist/DictionarySearchTab.tsx`
- `apps/ui/components/training/wordlist/WordListTab.tsx`
- `apps/ui/components/training/SettingsModal.tsx`
- `apps/ui/tests/TrainingScreen.test.tsx`

Required changes:

- Add `Zoekbereik` controls to dictionary search:
  - `Leertaal` or `Taal`;
  - `Woordenboekbron`: all readable sources in language or one selected source.
- Default lookup language from current training language when search state is
  created.
- After the user changes lookup language/source, persist it only as search modal
  state unless product later decides to save default dictionary preferences.
- Pass `languageCode` and selected dictionary IDs into `searchWordEntries`.
- Show result summary copy such as:
  - `Zoekt in Engelse woordenboekbronnen`;
  - `Zoekt in EN Core Test`;
  - `Geen resultaten in dit zoekbereik`.
- Keep list-scoped search visibly separate from dictionary lookup.

Acceptance criteria:

- Changing search language does not change current training list or language.
- Search result rows continue to show dictionary source and match reason.
- Duplicate headwords across dictionaries are understandable in the result
  list.

### B8: Settings Cleanup For Defaults

Status: planned.

Purpose:

Avoid using global settings as the primary current-training switch.

Likely files:

- `apps/ui/components/training/SettingsModal.tsx`
- `apps/ui/lib/training/preferencesService.ts`
- `apps/ui/tests/TrainingScreen.test.tsx`

Required changes:

- Label global learning language as a default, for example
  `Standaard leertaal`.
- Show current training scope only as status or link to `Huidige training`.
- If default dictionary sources are added, keep them separate from current
  search `Zoekbereik`.

Acceptance criteria:

- User can tell the difference between changing default language and switching
  the current training session.
- Settings do not duplicate the full training scope picker.

### B9: Tests And Browser QA

Status: planned.

Required tests:

- SQL/RPC:
  - available languages/sources from fixtures;
  - per-language active training scope;
  - user-list language filtering;
  - search language/source filters.
- UI unit/component:
  - footer summary includes language when multiple languages are available;
  - scope picker restores `nl -> en -> nl`;
  - list picker separates viewed list from active training list;
  - dictionary search passes lookup scope filters.
- Browser QA:
  - desktop `nl -> en -> nl` training switch;
  - mobile `nl -> en -> nl` training switch;
  - `bank` search in Dutch, English all sources, English one source;
  - list browsing in English and French;
  - global settings default language does not silently change current training.

Validation commands:

- `scripts/db-local-supabase.sh apply`
- `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f db/test-fixtures/search_multisource.sql`
- `scripts/db-local-supabase.sh probe`
- `cd apps/ui && npm run typecheck`
- `cd apps/ui && npm test -- tests/TrainingScreen.test.tsx tests/trainingService.listsPreferences.test.ts tests/trainingService.mappers.test.ts`
- `cd apps/ui && FSRS_TEST_DB_URL="$SUPABASE_DB_URL" npm test -- tests/fsrs/*.test.ts`
- Browser smoke through `nl-local-ui-qa` / `2000nl-local-ui-qa`.

### Recommended Build Order For B-Track

1. B0: confirm decisions.
2. B1: lock fixture/load validation.
3. B2: available languages/sources API.
4. B3: per-language active training scope.
5. B4: search scope backend.
6. B5: list language filtering.
7. B6: training scope UI.
8. B7: dictionary search UI scope.
9. B8: settings cleanup for defaults.
10. B9: full fixture-backed QA and screenshots.

The order matters: UI work should not hardcode language/source options before
B2, and search UI should not expose filters before B4 can enforce them.

## Agent Task Board

### A0: Source-Of-Truth Decision Doc

Status: complete.

Type: product/architecture documentation, no code changes.

Purpose:

Define exactly what owns dictionary source, list, search scope, training session,
list defaults, global preferences, and one-off overrides.

Suggested files:

- `docs/intent/search-and-lists/`
- `docs/intent/current-transformation-targets.md`
- `docs/exec-plans/active/platform-dictionary-transformation.md`

Output:

- `docs/intent/search-and-lists/source-of-truth-decision.md`

Acceptance criteria:

- Defines the four product objects: dictionary source, list, training session,
  preferences.
- Defines override precedence.
- Defines whether `VanDale 2k` is a list, dictionary subset, or both.
- Defines whether training can happen directly from dictionary source or only
  from lists.
- Defines scope of `Markeer als geleerd`.
- Defines what `Train dit woord` does.
- Defines whether search source follows active training language/list or is
  independent.
- Lists open decisions that cannot be resolved from current context.

Validation:

- Documentation review only.
- No UI/code tests expected.

Agent prompt:

```text
Create a source-of-truth decision document for 2000nl search/lists/training IA.
Use docs/exec-plans/active/search-lists-multisource-ux-remediation-roadmap.md
and the senior UX review as input. Do not change UI code. Define dictionary
source, list, training session, global preferences, list defaults, search scope,
and one-off training actions. Include override precedence, terms to use in UI,
and unresolved product questions.
```

### A1: Terminology And Copy Contract

Status: complete.

Type: product/copy documentation, then small UI copy cleanup only if explicit.

Purpose:

Prevent the UI from adding more clarifying badges and internal labels.

Suggested files:

- new or updated doc under `docs/intent/search-and-lists/`
- later UI references in `apps/ui/components/training/`

Output:

- `docs/intent/search-and-lists/terminology-contract.md`

Acceptance criteria:

- Separates interface language, learning language, translation language,
  dictionary source, training list, search scope, current session, and global
  defaults.
- Replaces ambiguous/internal terms:
  - `bekeken lijst`;
  - `Effectieve trainingsscope`;
  - ambiguous `Alleen deze lijst`;
  - `Trainingsinstellingen` when it means list recommendations/defaults;
  - `Bevriezen` if used for learner-facing "pause/later" behavior.
- Provides Dutch labels for each concept.
- States where each term should appear.

Validation:

- Documentation review.
- If copy is implemented: `cd apps/ui && npm run typecheck` and targeted tests.

Agent prompt:

```text
Create a terminology contract for the 2000nl search/lists/training UI after the
source-of-truth model is defined. Do not perform broad UI redesign. Produce a
Dutch label map for dictionary source, training list, search scope, learning
language, interface language, translation language, current session, global
defaults, list defaults, and one-off actions. Flag current terms that should be
removed or renamed.
```

### A2: Multi-Source Fixture Plan

Status: complete.

Type: data/test plan first; implementation can be a separate task.

Purpose:

Create realistic pressure before finalizing UI for multiple dictionaries and
languages.

Suggested files:

- `db/seeds/`
- `apps/ui/playwright/tests/`
- `apps/ui/tests/`
- `packages/ingestion/` only if fixture generation needs it.

Output:

- `docs/intent/search-and-lists/multisource-fixture-plan.md`

Acceptance criteria:

- Defines a second Dutch dictionary with about 10 entries.
- Defines one second language, such as English or French.
- Defines at least two dictionaries in that second language.
- Includes overlapping headwords across dictionaries.
- Includes one query that appears only in examples.
- Includes one query that appears only in definitions.
- States whether fixtures are DB seeds, mocked Playwright data, or both.

Validation:

- If implemented in DB seeds: local seed/reset path still works.
- If implemented in Playwright: e2e can render the fixture states.

Agent prompt:

```text
Design the smallest useful multi-source fixture set for 2000nl UX testing. Do
not redesign UI. Define entries for a second Dutch dictionary and a second
language with two dictionaries. Include overlapping headwords, example-only
matches, definition-only matches, and duplicate headwords across sources.
Recommend whether to implement as DB seed data, Playwright mocked data, or both.
```

### A3: Search Ranking And Grouping Contract

Status: complete.

Type: product/search contract; implementation is A4.

Purpose:

Define exactly why each search result appears and in what order.

Suggested files:

- `docs/intent/search-and-lists/`
- `packages/docs/`
- later `apps/ui/lib/training/listService.ts` and DB/RPC docs.

Output:

- `docs/intent/search-and-lists/search-ranking-grouping-contract.md`

Acceptance criteria:

- Defines result groups:
  - exact headword;
  - lemma/inflection;
  - related headwords/compounds;
  - examples containing query;
  - definitions containing query;
  - broad fallback/alphabetical.
- Defines order and expansion defaults.
- Defines row metadata requirements: match type, dictionary source, part of
  speech, meaning number where useful.
- Defines duplicate-headword behavior across dictionaries.
- States backend/RPC requirements.
- Provides expected behavior for `huis`.

Validation:

- Documentation review.
- Search implementation tasks must cite this contract.

Agent prompt:

```text
Write the search ranking and grouping contract for 2000nl dictionary lookup.
Use the Van Dale comparison and the `huis` failure as evidence. Define result
groups, ordering, row metadata, duplicate dictionary behavior, and backend/RPC
requirements. Do not implement code in this task.
```

### A4: Search Results Implementation

Status: complete; fixture-backed broad example/definition screenshots still
belong to A10.

Type: backend/UI implementation.

Purpose:

Make search trustworthy: exact headword/lemma first, broad matches later, with
grouped presentation.

Likely files:

- `apps/ui/components/training/wordlist/DictionarySearchTab.tsx`
- `apps/ui/lib/training/listService.ts`
- search-related RPCs/migrations under `db/` if ranking cannot be done safely in
  the client.
- `apps/ui/tests/TrainingScreen.test.tsx`
- `apps/ui/playwright/tests/training.spec.ts`

Output:

- Added `db/migrations/063_ranked_word_entry_search.sql` and included it in
  `db/migrations/bootstrap.sql`.
- Updated `search_word_entries_gated` to rank exact headword, word-form,
  related headword, example, definition, and fallback matches.
- Search payload now includes dictionary metadata and match metadata:
  `dictionary_name`, `dictionary_slug`, `dictionary_kind`,
  `search_group_rank`, `search_match_group`, `search_match_label`,
  `search_matched_text`.
- `DictionarySearchTab` displays dictionary source and match labels on result
  rows.
- Added focused mapper/service/UI tests for match metadata and ranked display
  order.
- Updated `docs/reference/api-functions/search-and-user.md`.

Acceptance criteria:

- Searching `huis` shows exact `huis` before compounds.
- Results are grouped or clearly ranked according to A3.
- Row metadata explains match type.
- No broad substring/compound result appears before exact/lemma result.
- Empty/loading/error states still work.
- Selected detail remains coherent when groups or filters change.

Validation:

- Passed: `cd apps/ui && npm run typecheck`
- Passed: `cd apps/ui && npm test -- tests/TrainingScreen.test.tsx tests/trainingService.mappers.test.ts tests/trainingService.listsPreferences.test.ts`
- Passed SQL syntax/application against local Supabase DB:
  `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f db/migrations/063_ranked_word_entry_search.sql`
- Not rerun: `cd apps/ui && npm run test:e2e -- training.spec.ts`
  - Earlier attempt was blocked before tests by local port conflict:
    `http://127.0.0.1:3100 is already used` and Playwright config has
    `reuseExistingServer: false`.

Agent prompt:

```text
Implement grouped/ranked dictionary search according to the approved search
contract. Exact headword/lemma matches must appear before compounds and broad
substring matches. Update row metadata so users can tell why a result appeared.
Keep changes scoped to search services/components/tests. Do not redesign the
lists tab or training footer in this task.
```

### A5: Persist Search State Across Modal Tabs

Status: complete.

Type: UI state fix.

Purpose:

Preserve the user's lookup task while the modal remains open.

Likely files:

- `apps/ui/components/training/SettingsModal.tsx`
- `apps/ui/components/training/wordlist/DictionarySearchTab.tsx`
- maybe state ownership in `TrainingScreen.tsx`
- `apps/ui/tests/TrainingScreen.test.tsx`
- `apps/ui/playwright/tests/training.spec.ts`

Output:

- Lifted dictionary search state to `SettingsModal` so query, results,
  selected detail, pagination, and list-filter state survive tab switches while
  the modal stays open.
- Closing the modal still resets search state because `TrainingScreen`
  unmounts `SettingsModal`.
- Added targeted `TrainingScreen.test.tsx` coverage for tab persistence,
  close/reset behavior, and empty-query clear-button visibility.

Acceptance criteria:

- Tab switching does not reset query.
- Tab switching preserves results, selected entry, source/filter settings, and
  reasonable scroll position if practical.
- Clear `x` resets query explicitly.
- Closing modal behavior is explicitly chosen and tested.
- No `Wis zoekopdracht` appears for an actually empty query.

Validation:

- Passed: `cd apps/ui && npm run typecheck`
- Passed: `cd apps/ui && npm test -- tests/TrainingScreen.test.tsx`
- Attempted: `cd apps/ui && npm run test:e2e -- training.spec.ts`
  - Blocked before tests by local port conflict:
    `http://127.0.0.1:3100 is already used` and Playwright config has
    `reuseExistingServer: false`.

Agent prompt:

```text
Fix search state persistence in the settings/search modal. When the user enters
a dictionary query, switches to Lijsten/Instellingen/Statistieken, and returns
to Zoeken, preserve query, results, selected entry, and source/filter state while
the modal remains open. Add tests. Do not change search ranking/grouping in this
task.
```

### A6: Training Footer IA

Status: complete.

Type: UI simplification.

Purpose:

Remove duplicated persistent configuration from the main training surface.

Likely files:

- `apps/ui/components/training/FooterStats.tsx`
- `apps/ui/components/training/EffectiveTrainingScopeSummary.tsx`
- `apps/ui/components/training/TrainingScreen.tsx`
- related tests.

Output:

- Footer now shows progress plus one `Huidige training` summary by default.
- Language/list/scenario/card-filter controls are collapsed behind `Wijzigen`
  instead of being always visible.
- Mobile footer is collapsed by default and keeps the current-training summary
  visible.
- Existing footer controls remain reachable after expanding `Wijzigen`.
- Updated targeted tests for collapsed controls and the approved A1 term
  `Huidige training`.

Acceptance criteria:

- Footer shows progress and one current-session summary.
- Repeated always-visible pill row is collapsed behind `Wijzigen`, popover, or
  drawer.
- Summary uses approved terms from A1.
- Mobile footer is collapsed by default.
- Existing controls remain reachable.

Validation:

- Passed: `cd apps/ui && npm run typecheck`
- Passed: `cd apps/ui && npm test -- tests/TrainingScreen.test.tsx`
- Passed browser smoke with Playwright fallback against
  `http://localhost:3100/dev/test-login?redirectTo=/`.
  - Browser/Chrome DevTools MCP was unavailable because the shared Chrome
    profile was already locked by another running browser instance.
  - Desktop collapsed footer had `Wijzigen`, `Huidige training`, and no
    active-list control; expanded footer exposed the controls.
  - Mobile reload stayed collapsed with `Huidige training` visible and controls
    hidden.

Agent prompt:

```text
Simplify the training footer according to the approved IA. Keep progress
visible. Show one current-training summary and one `Wijzigen` affordance. Move
the language/list/scenario/card-filter controls into an expanded state, popover,
or drawer. Do not change scheduler behavior.
```

### A7: Entry Detail Action Hierarchy

Status: complete.

Type: UI hierarchy/action model.

Purpose:

Make entry detail primarily about understanding the entry, with actions
secondary and clear.

Likely files:

- `apps/ui/components/training/WordDetailPanel.tsx`
- `apps/ui/components/training/wordlist/WordDetailDrawer.tsx`
- membership tests.

Output:

- Entry detail actions now live in the scrollable content after source,
  definitions, examples, translation, and membership instead of a fixed bottom
  rail.
- Add-to-list remains the primary visible action; progress/current-card and
  train-next actions are under `Meer acties`.
- `Bevriezen` was renamed to learner-facing `Later oefenen`.
- `Train dit woord` was renamed to `Train dit woord hierna` and remains
  labelled as a one-shot next-card action for assistive tech.
- Train-next is hidden when the selected entry is already the current training
  card.
- Added targeted membership/detail tests for current-card action copy and
  train-next hiding.

Acceptance criteria:

- Order is headword/source, definition, examples, translation, membership,
  actions.
- Definition/examples are visible before a large action block.
- On desktop, actions are compact and do not consume most sidebar height.
- On mobile, one primary action plus `More` or expandable actions.
- `Train dit woord` behavior is hidden/renamed when the entry is already the
  current training card, unless product defines a distinct meaning.
- Internal labels like `Bevriezen` are learner-facing if present.

Validation:

- Passed: `cd apps/ui && npm run typecheck`
- Passed: `cd apps/ui && npm test -- tests/WordDetailPanel.membership.test.tsx tests/TrainingScreen.test.tsx`
- Passed browser smoke with Playwright fallback against
  `http://localhost:3100/dev/test-login?redirectTo=/`.
  - Desktop detail order was definition, examples, membership, actions.
  - Desktop and mobile showed `Meer acties`; `Later oefenen` appeared only
    after expansion.
  - `Bevriezen` was absent in desktop and mobile detail states.

Agent prompt:

```text
Rebalance the entry detail panel so understanding comes before actions. Keep
definition, examples, translation, and membership readable. Make actions compact
and secondary unless the approved product model says one action is primary. Do
not change search ranking or footer controls in this task.
```

### A8: Lists IA And Dictionary Mode

Status: complete.

Type: UI IA cleanup.

Purpose:

Stop using `Lijsten` as an ambiguous list/dictionary/search hybrid.

Likely files:

- `apps/ui/components/training/wordlist/WordListTab.tsx`
- `apps/ui/components/training/wordlist/WordsToolbar.tsx`
- `apps/ui/components/training/wordlist/MobileListPickerSheet.tsx`
- tests.

Acceptance criteria:

- `Lijsten` is primarily for list browsing/management.
- If dictionary browsing remains here, mode is a true segmented control:
  `Lijstinhoud | Woordenboekentries` or approved A1 labels.
- Current state and target action are not confused.
- Dictionary source selection is explicit and not mixed with active training
  list.
- Count mismatch is fixed: dictionary source should not read as `0 woorden`
  while main panel has thousands of dictionary entries.
- Sidebar taxonomy is simplified: training lists, my lists, curated lists; avoid
  equal-weight dictionary-source cards unless explicitly browsing sources.

Validation:

- 2026-05-26: `cd apps/ui && npm run typecheck` passed.
- 2026-05-26: `cd apps/ui && npm test -- tests/TrainingScreen.test.tsx`
  passed.
- 2026-05-26: Browser/Chrome MCP was still blocked by the shared Chrome
  profile, so a Playwright fallback smoke checked desktop and mobile at
  `http://localhost:3100/dev/test-login?redirectTo=/`. Verified list taxonomy,
  `Lijstinhoud | Woordenboekentries` segmented mode, explicit `Bron: VanDale
  woordenboek`, and no equal-weight dictionary-source sidebar.

Agent prompt:

```text
Clean up the Lists tab IA. Make list browsing the primary purpose. If dictionary
browsing stays inside this tab, replace the current toggle with a clear
segmented control that shows current mode. Make dictionary source separate from
training list. Do not change global settings or search result ranking in this
task.
```

### A11: Entry Membership Navigation And Removal

Status: ready.

Type: targeted entry-detail/list-management UI slice.

Purpose:

Turn entry membership rows from passive state into useful list navigation and
editable membership controls.

Suggested files:

- `apps/ui/components/training/WordDetailPanel.tsx`
- `apps/ui/components/training/SettingsModal.tsx`
- `apps/ui/components/training/wordlist/WordListTab.tsx`
- `apps/ui/lib/training/listService.ts`
- `apps/ui/tests/WordDetailPanel.membership.test.tsx`
- `apps/ui/tests/TrainingScreen.test.tsx`

Output:

- Membership rows in entry detail offer an explicit way to open the containing
  list without changing the active training list.
- Opening a containing list switches the settings modal to `Lijsten`, selects
  that list as the viewed list, and preserves or highlights the originating
  entry where practical.
- Editable user-list memberships can be removed from entry detail.
- Curated/read-only memberships remain visibly read-only and do not show a
  destructive action.
- After removal, the membership section refreshes in place and the list state is
  refreshed.

Acceptance criteria:

- Clicking/opening a membership changes only the viewed list, not the active
  training list.
- Removing a user-list membership calls the explicit user-list remove RPC/action
  and updates visible membership state.
- Dictionary source metadata still does not appear as membership.
- Curated memberships are navigable/read-only but not removable.
- Empty, loading, error, duplicate, and post-remove states remain clear.

Validation:

- `cd apps/ui && npm run typecheck`
- `cd apps/ui && npm test -- tests/WordDetailPanel.membership.test.tsx tests/TrainingScreen.test.tsx`

Agent prompt:

```text
Implement entry membership navigation and removal. In WordDetailPanel, make
learning-list membership rows actionable: users can open a containing list in
the Lijsten tab without changing active training scope, and can remove editable
user-list memberships directly from entry detail. Keep curated memberships
read-only, keep dictionary source separate from membership, refresh membership
and list state after removal, and add focused tests.
```

### A9: Global Settings Cleanup

Status: complete.

Type: UI settings cleanup.

Purpose:

Make `Instellingen` global preferences only, not a duplicate active-session
control panel.

Likely files:

- `apps/ui/components/training/SettingsModal.tsx`
- settings subcomponents if extracted.
- preference hook/tests.

Acceptance criteria:

- Settings labels distinguish:
  - interface/instruction language;
  - learning language;
  - translation language;
  - default search dictionaries;
  - default training scenario;
  - default card types;
  - default new/review mix.
- Active training state is read-only or linked back to training screen if shown.
- No active training session control is duplicated as if it were a global
  preference.
- Copy follows A1 terminology.

Validation:

- 2026-05-26: `cd apps/ui && npm run typecheck` passed.
- 2026-05-26: `cd apps/ui && npm test -- tests/TrainingScreen.test.tsx`
  passed.
- 2026-05-26: Browser/Chrome MCP was still blocked by the shared Chrome
  profile, so a Playwright fallback smoke checked desktop and mobile settings.
  Verified interface/instruction language, learning language, translation
  language, default search dictionaries, default scenario, default card types,
  default new/review mix, and read-only active-training summary/link.

Agent prompt:

```text
Clean up the global Settings tab so it owns defaults/preferences only. Separate
interface language, learning language, and translation language. Do not duplicate
current training session controls here except as read-only summary/link. Follow
the approved terminology contract.
```

### A10: Current Screenshot Recapture And Reviewer Package

Status: complete.

Type: QA/artifact generation.

Purpose:

Give reviewers current evidence after implementation, especially mobile and
multi-source states.

Required screenshots:

- current desktop training main;
- current mobile training main;
- current search exact headword;
- current search example-only match;
- current search definition-only match;
- no-results search;
- loading/error search if practical;
- multi-dictionary duplicate headword result;
- multi-language/source switch;
- list browsing;
- list/dictionary mode if it still exists;
- list training defaults/recommendations;
- global settings full scroll;
- entry detail long content with multiple memberships;
- current duplicate-add and successful-add states;
- one-off `Train dit woord` success and failure states;
- active-training-list switch.

Validation:

- 2026-05-26: Created
  `docs/exec-plans/active/search-lists-multisource-ux-evidence-2026-05-26/`
  with screenshot inventory and caveats.
- 2026-05-26: Captured screenshots against live local DB via Playwright
  fallback because Browser/Chrome MCP was blocked by the shared Chrome profile.
- 2026-05-26: Local DB health check recorded in the package:
  `postgres|postgres|172.18.0.2|5432|17389`.
- 2026-05-26: Package caveats disclose missing fixture-only states:
  multi-dictionary duplicates, multi-language/source switch, example-only and
  definition-only forced matches, duplicate/success add-to-list, one-off
  train-next feedback, and active-training-list switch.

Agent prompt:

```text
Capture a current UX evidence package after the search/lists/training IA fixes.
Include desktop and mobile screenshots for search, lists, settings, entry
details, multi-source/multi-language states, add-to-list, duplicate-add, active
training switch, and one-off train-next feedback. Include a README with capture
caveats and screenshot inventory.
```

## Work That Should Not Be Given To Agents Yet

Do not assign these until the relevant model decision exists:

- A broad "make UI nicer" task.
- Full mobile redesign.
- Settings rewrite without A0/A1.
- Multi-language UI without fixture and source model.
- Entry action redesign before deciding primary action and `Train dit woord`
  semantics.
- Dictionary/list sidebar redesign before deciding whether dictionary sources
  belong in `Lijsten`.

## Parallelization Guidance

Safe to run in parallel:

- A0 and A2 planning, if both agents coordinate outputs.
- A5 search persistence can run while A3 search contract is being written.
- A10 only after enough implementation tasks land.

Do not run in parallel:

- A6 footer, A8 lists, and A9 settings before A0/A1, because they will invent
  conflicting source-of-truth language.
- A4 search implementation before A3, because ranking/grouping needs a contract.
- A7 detail actions before product decides primary action and `Train dit woord`
  semantics.

## Suggested First Three Agent Assignments

1. A0 Source-of-truth decision doc.
2. A5 Search state persistence.
3. A3 Search ranking/grouping contract.

Reasoning:

- A0 unblocks the IA-heavy work.
- A5 fixes a clear broken-feeling behavior without waiting for ranking.
- A3 prepares the highest-trust-risk implementation task.

## Validation Baseline

For UI/code tasks, prefer the narrowest relevant checks:

- `cd apps/ui && npm run typecheck`
- `cd apps/ui && npm test -- tests/TrainingScreen.test.tsx`
- `cd apps/ui && npm test -- tests/WordDetailPanel.membership.test.tsx`
- `cd apps/ui && npm run test:e2e -- training.spec.ts`
- browser smoke at `http://localhost:3100/`

For local browser QA, follow `nl-local-ui-qa` / `2000nl-local-ui-qa` guidance:

- start UI with `scripts/ui-local-dev.sh --port 3100`;
- health check `curl -sS 'http://localhost:3100/api/health?deep=1'`;
- use `/dev/test-login?redirectTo=/`;
- disclose mocked screenshots if local auth/session state is not reliable.
