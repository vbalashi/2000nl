# Reading-size preferences — #265

Owner decision: 2026-09-06. This extends the approved #249 three-size study,
not a new renderer or a responsive-layout redesign.

## Product contract

| Preference | Ownership | Rule |
| --- | --- | --- |
| Phone text size | Account | Normal / Large / Largest; default Normal |
| Computer / tablet text size | Account | Same choices, saved independently |
| Profile for this browser | Browser only | Phone or Computer / tablet; window resizing never changes it |

Initialize the browser profile from its low-entropy mobile hint, falling back
to a phone user-agent check. Tablets default to the computer profile. An
explicit browser choice overrides detection. No viewport-width detection or
high-entropy fingerprinting. If local storage is unavailable, disclose that
the device choice lasts only for the current page.

`apps/ui/lib/reading/readingSize.ts` is the single numerical preset table for
Training, structured Details and the dev comparison. Main reading copy grows
more than the headword; the article stays half the actual headword size.
Navigation, badges and action controls do not inherit reading-text sizes.

| Reading role (px) | Normal | Large | Largest |
| --- | ---: | ---: | ---: |
| Definitions, examples, usage, expressions | 16 | 18 | 20 |
| Nested notes / translations | 13 | 14 | 15 |
| Emphasized translation | 15 | 16 | 17 |
| Face headword | 48 | 50 | 52 |
| Answer / Details headword | 44 | 46 | 48 |

Long headwords and reverse prompts retain the bounded formulas in the same
table. Small screens scroll reading content; they do not silently cancel the
reader's larger-text choice. Normal Training retains the published #263
appearance. Details adopts these roles instead of its previous hard-coded
sizes.

## State and persistence

`ReadingPreferencesProvider` owns profile selection, account loading, live
preview and independent per-profile save states. It wraps the app content,
not individual cards. Changing size must not advance a card, submit a grade,
reset a session or change the revealed side.

`readingPreferencesRepository` owns the Supabase boundary. These are app-local
UI preferences, so direct `user_settings` access under existing RLS follows
`ARCHITECTURE.md`. Migration 129 adds two bounded columns. Each save upserts
only `user_id` and the selected column; never read/replace the other profile or
the whole preferences object. There are no scheduler/RLS policy changes.

Loading failure disables size writes until retry succeeds. Failed saves retain
an explicitly temporary preview and a retry control, not a false Saved state.
Account changes discard pending load results from the previous account.

## Verification boundary

- Component tests: actual Settings section and provider against an external
  storage fake; independent writes, device choice, errors/retry, account switch.
- Browser tests: actual Settings → repository → Training, replacing only the
  external Supabase transport. These are not a claim of authenticated DB QA.
- SQL tests: defaults, constraints, independent/concurrent partial updates,
  unrelated settings and RLS in a disposable database.
- Existing three-size browser matrix: narrow long reverse/hint, translated
  Answer, long words, themes, pinned actions and article proportion.

Full article-level Details tabs (#70/#252), common app shell (#264), and
unfinished responsive states stay separate. #143 and draft #144 are excluded.
