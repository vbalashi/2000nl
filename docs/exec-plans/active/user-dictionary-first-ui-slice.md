# User Dictionary First UI Slice

## Goal

Ship the first product slice where a user dictionary is visible and usable from
the current training UI without collapsing it into a learning list:

- create a private editable dictionary entry,
- copy a trusted dictionary entry into the user's dictionary,
- show dictionary source metadata in search/detail/list flows,
- add the user-dictionary entry to a learning list,
- train that entry through the existing list/card/FSRS pipeline,
- preserve the separation between dictionary source, viewed list, learning
  list, and active training scope.

## Implemented In This Slice

- Added first-party UI controls in dictionary search for creating a private
  `user-entry-v1` entry with headword, definition, translation, example, and
  notes fields.
- Added detail-panel action for copying a trusted dictionary entry into the
  user's private dictionary.
- Added service wrappers for the platform actions `create-user-entry` and
  `copy-to-user-dictionary`.
- Added `fetchDictionaryEntryById` support so newly created/copied entries can
  be reloaded with dictionary source metadata.
- Propagated newly created user-dictionary entries through search/detail/list
  state so the user can immediately see the source, add the entry to a user
  list, and train it as the next card.
- Added migration `065_fetch_entry_by_id_dictionary_metadata.sql` so
  `fetch_dictionary_entry_by_id_gated` returns dictionary name, slug, and kind.

## Validation

Passed locally:

- `cd apps/ui && npm run typecheck`
- `cd apps/ui && npm test -- tests/TrainingScreen.test.tsx`
- `cd apps/ui && npm test -- tests/trainingService.dictionary.test.ts tests/TrainingScreen.test.tsx tests/WordDetailPanel.membership.test.tsx tests/WordDetailPanel.translation.test.tsx`

Known non-blocking test noise:

- Existing React `act(...)` warnings from `WordListTab` still appear in the
  `TrainingScreen` suite.
- The `trainingService.dictionary` suite intentionally logs the mocked missing
  RPC case for one negative-path test.

Blocked by local environment:

- SQL smoke could not run because `SUPABASE_DB_URL` is not set.
- Local Supabase wrapper status is blocked by Docker/Colima:
  `Cannot connect to the Docker daemon at unix:///Users/khrustal/.colima/default/docker.sock`.
- Browser QA is not yet run because canonical port `3100` is not serving and
  local Supabase cannot start while Docker/Colima is unavailable.

## Remaining Before Closing The Goal

- Apply migration `065_fetch_entry_by_id_dictionary_metadata.sql` to a local or
  disposable DB and verify `fetch_dictionary_entry_by_id_gated` returns
  dictionary metadata for both trusted and user-owned entries.
- Run local UI QA on port `3100` once local Supabase/Docker is available:
  create custom entry, copy trusted entry, add user entry to a list, train it as
  next card, and verify active training scope is not switched by those actions.
- Decide whether this first slice needs editing existing user entries now, or
  whether edit/delete stays in the next user-dictionary slice.

