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
- `cd apps/ui && npm test -- tests/api/platformActionsRoute.test.ts tests/trainingService.dictionary.test.ts tests/WordDetailPanel.membership.test.tsx tests/TrainingScreen.test.tsx tests/WordDetailPanel.translation.test.tsx`
- `cd apps/ui && npm run lint`
- Manual SQL smoke against local Supabase verified
  `fetch_dictionary_entry_by_id_gated` returns dictionary metadata for trusted,
  created user, and copied user entries.
- Local backend-backed browser smoke on `http://localhost:3100` via
  `/dev/test-login?redirectTo=/` verified:
  - create a private `user-entry-v1` entry and see `Bron: My dictionary`,
  - add the user-dictionary entry to `QA saved words`,
  - train the user-dictionary entry as the next card,
  - copy a trusted `nl-vandale` entry into `My dictionary` and see the copied
    detail source as `Bron: My dictionary`.

Browser QA evidence:

- `reports/qa/user-dictionary-first-ui-slice/01-after-dev-login.png`
- `reports/qa/user-dictionary-first-ui-slice/02-created-user-entry.png`
- `reports/qa/user-dictionary-first-ui-slice/03-added-to-learning-list.png`
- `reports/qa/user-dictionary-first-ui-slice/04-trained-user-entry-next-card.png`
- `reports/qa/user-dictionary-first-ui-slice/05-trusted-entry-detail.png`
- `reports/qa/user-dictionary-first-ui-slice/06-copied-trusted-entry.png`
- `reports/qa/user-dictionary-first-ui-slice/console-create-add-train.json`
- `reports/qa/user-dictionary-first-ui-slice/console-copy.json`

Known non-blocking test noise:

- Existing React `act(...)` warnings from `WordListTab` still appear in the
  `TrainingScreen` suite.
- The `trainingService.dictionary` suite intentionally logs the mocked missing
  RPC case for one negative-path test.

Resolved local QA setup issue:

- `/api/dev/test-session` was using `NEXT_PUBLIC_SUPABASE_URL` first, which can
  be remote from `.env.local` even when the UI wrapper points server-side routes
  at local Supabase. The dev-only route now prefers server-side
  `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`; the
  wrapper exports `SUPABASE_ANON_KEY`. The dev-session user now exists in local
  `auth.users`.

Known unrelated local probe issue:

- `scripts/db-local-supabase.sh all` applies migrations and the targeted SQL
  smoke passes, but the broad `local_supabase_probe.sql` still fails on
  pre-existing public/anon execute grants for legacy word-list RPCs:
  `get_active_word_list(uuid)`,
  `get_available_word_lists(uuid,text,text)`, and
  `update_active_word_list(uuid,uuid,text)`. This is not introduced by this
  slice and is tracked separately from user-dictionary behavior.

## Deferred Next Slice

- Editing/deleting existing user dictionary entries stays in the next
  user-dictionary slice. The current slice proves that created/copied entries
  are private user-owned dictionary entries and can already flow into lists and
  training.
