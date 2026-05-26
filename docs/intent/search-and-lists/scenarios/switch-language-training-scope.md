# Scenario: Switch Language And Training Scope

Status: Draft
Primary role: Multi-language learner
Secondary roles: Card-training user, List curator, Lookup-first user

## User Intent

When a user studies more than one learning language, the user wants to switch
from the current default language to another language and continue the right
training list for that language, so that parallel learning does not require
rebuilding context or guessing which list/session is active.

Example: the user usually opens the app in Dutch, but today wants to practice
English. They have previously studied English and expect to find the English
list they were working on, make it the current training scope, and start
training without accidentally changing or mixing Dutch training state.

## Scope

In scope:

- Switching the learning/search language from the training surface or list UI.
- Finding lists for the selected language.
- Selecting a viewed list for inspection.
- Explicitly making that list the active training list.
- Starting or continuing training with the selected language/list.
- Returning later to another previously studied language/list.
- Keeping dictionary lookup scope separate from training scope.

Out of scope:

- Creating full language-course onboarding.
- Creating language-specific dashboards.
- Cross-language mixed-list training recommendations.
- Translating UI chrome or onboarding copy.
- Importing or managing production dictionary sources.

## Current UI Path

### Desktop: footer-first path

1. User opens the training screen.
2. User sees the footer summary and presses `Wijzigen`.
3. The footer exposes a `Taal` selector, but it currently only offers
   `Nederlands`.
4. User cannot switch to English or French from this primary training control.
5. User must open the settings/modal surface instead.

### Desktop: settings/list path

1. User opens settings.
2. User goes to `Woorden en lijsten`.
3. User opens the `Lijsten` tab.
4. User can change `Taal`/`Leertaal` in the list area.
5. Curated lists refresh by language.
6. User selects a list to inspect.
7. User must use an explicit action such as `Gebruik voor training`/make active
   to make the viewed list the active training list.
8. User closes settings and returns to training.

### Mobile path

1. User opens the lists surface.
2. User opens the mobile list picker.
3. User can change `Taal` in the sheet.
4. The sheet shows lists for the language, then the user picks a list to view.
5. User must separately identify whether that list is only viewed or is also
   active for training.

## Intended Product Flow

1. User sees the current training scope: language, training list, scenario, and
   card filter.
2. User opens a clearly labeled `Huidige training` or `Trainingsbereik`
   control.
3. User chooses `Leertaal: English`.
4. The app shows English training lists and preserves the user's previous
   English active list if one exists.
5. User chooses or confirms the English list.
6. The app clearly states whether this action changes the active training scope
   or only changes the viewed list.
7. User starts/continues training, and the next cards come from the confirmed
   English scope.
8. Later, user can switch back to Dutch and recover the previous Dutch active
   list without manual reconstruction.

## Comparison

| Step | Current support | Problem | Minimum requirement |
|---|---|---|---|
| See current language | Partial | Footer summary focuses on list/scenario/filter; language is only in controls after expanding. | Current training summary must show language when more than one language exists. |
| Switch language from main training control | Weak | Footer `Taal` currently only offers `Nederlands`. | Footer/session control must offer every available learning language or link clearly to the full language/list picker. |
| Switch language in settings/list UI | Partial | Settings/list and mobile picker expose `nl/en/de/fr`, but this is not the obvious primary path for "train English now". | The language switch must live in the training-scope flow, not only in global/list settings. |
| Preserve active list per language | Missing/ambiguous | Active training list is a single preference; changing language can leave an old-language active list selected unless explicitly reset. | Store or derive active training scope per language, or force an explicit list choice after language changes. |
| Pick viewed list | Supported | Viewed list and active training list are close together visually. | Selecting a list for inspection must not imply training scope change. |
| Make list active for training | Partial | There is an explicit action, but it is nested in the list-management surface. | The action must be prominent in the language-switch/training-scope flow. |
| Search words in selected language | Missing | Dictionary search receives `language` as display context only; backend search is global across accessible languages/sources. | Search must pass a lookup language/source scope to the backend and show that scope in the result summary. |
| Return to previous language | Missing/ambiguous | The app does not appear to remember "Dutch active list" and "English active list" separately. | Returning to a language should restore that language's last training list or ask for one explicitly. |

## Role Variants

| Role | Difference |
|---|---|
| Multi-language learner | Needs fast switching between known language/list pairs without losing either context. |
| Card-training user | Wants the shortest path from opening the app to the right due/new queue. |
| List curator | May switch language to inspect/manage lists without changing training scope. |
| Lookup-first user | May switch search language/source to look up a word without changing training scope. |

## Current-State Evidence

- `FooterStats` accepts `language` and `onLanguageChange`, but the footer
  language options currently contain only `nl`.
- `SettingsModal` and `MobileListPickerSheet` expose `nl`, `en`, `de`, and `fr`
  language options.
- `fetchCuratedLists(languageCode)` passes `p_language_code` to
  `get_available_word_lists`, so curated lists can refresh by language.
- `fetchUserLists` currently ignores the language argument and fetches all user
  lists.
- `searchWordEntries` does not accept or pass `languageCode` or dictionary
  source filters.
- `search_word_entries_gated` returns language/source metadata but does not
  accept language or dictionary-source scope parameters.

## Open Questions

- Should active training list be remembered per learning language, or should a
  language switch always require explicit list confirmation?
- Should global `Leertaal` mean "default training language" only, or also the
  default lookup language?
- Should mixed-language lists appear under every language, under a separate
  `Gemengde lijsten` group, or only when "all languages" is selected?
- Should user lists be filtered by `language_code`, `primary_language_code`, or
  membership contents when switching language?
- Should `de` remain visible before German dictionary fixtures exist?

## Derived Requirements

- Add an explicit training-scope switcher that includes language and list.
- Expand footer language choices or route the footer to the full scope picker.
- Do not silently keep an active list from a different language after a language
  change unless the UI explicitly labels it as mixed-language or cross-language.
- Add lookup language/source state to dictionary search UI.
- Extend search RPC/client filters with `language_code` and dictionary source
  scope before multi-language search is enabled by default.
- Show result summaries such as `Zoekt in Engelse woordenboekbronnen` or
  `Zoekt in EN Core Test`.
- Keep viewed list, active training list, and dictionary lookup scope as three
  separate states.
- Add tests/QA scenarios for switching `nl -> en -> nl` and preserving the
  expected active list behavior.
