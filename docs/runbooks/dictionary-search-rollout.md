# Dictionary and list search rollout

Dictionary lookup and list browsing have different stable owners:

- Dictionary lookup uses the grouped Library search flow and the unified
  Platform V2 Details surface. The former Library-only UI switch was retired by
  issue #252; the server V2 lookup/actions controls remain required.
- Viewed-list and global entry filtering use `fetch_words_for_list_gated` and
  `search_word_entries_gated`. This path owns part-of-speech, NT2, Frozen, and
  Don't show filters.

There is no separate dictionary-search client flag. The former
`NEXT_PUBLIC_DICTIONARY_SEARCH_V2` conditional was absent from production and
from both repository-owned rollout profiles, so its alternative UI path was
unreachable. Issue #176 retired that path rather than promoting behavior that
did not represent Frozen and Don't show filters.

## Deployment and rollback

The NUC deployment selects the only supported runtime profile,
`APP_ROLLOUT_PROFILE=pilot`. A pre-#252 `legacy` value is retired and must fail
before startup; remaining TrainingCard/listening migration is tracked in #142.
Release smoke must cover desktop and mobile Library lookup plus filtered list
browsing.

Rollback of a #252 build is an application redeploy to a pre-#252 compatible
commit; disabling the server V2 controls while serving the #252 UI would leave
Details unavailable. The production workflow pins `pilot`, and Docker Compose
requires an explicit profile. Do not restore the retired Library UI flag or
select `legacy` for a #252 build. Historical database migrations and
unreferenced RPCs remain migration provenance; dropping database objects needs
a separate usage audit and migration.
