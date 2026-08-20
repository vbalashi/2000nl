# Dictionary and list search rollout

Dictionary lookup and list browsing have different stable owners:

- Dictionary lookup uses the grouped Library search flow and Platform V2
  details where enabled by the approved Library rollout.
- Viewed-list and global entry filtering use `fetch_words_for_list_gated` and
  `search_word_entries_gated`. This path owns part-of-speech, NT2, Frozen, and
  Don't show filters.

There is no separate dictionary-search client flag. The former
`NEXT_PUBLIC_DICTIONARY_SEARCH_V2` conditional was absent from production and
from both repository-owned rollout profiles, so its alternative UI path was
unreachable. Issue #176 retired that path rather than promoting behavior that
did not represent Frozen and Don't show filters.

## Deployment and rollback

The NUC deployment selects `APP_ROLLOUT_PROFILE=pilot`, but dictionary/list
filtering is intentionally identical in `legacy` and `pilot`. Release smoke
must cover desktop and mobile Library lookup plus filtered list browsing.

Rollback is an application redeploy to the preceding compatible commit. Do not
restore the retired environment flag. Historical database migrations and the
unreferenced RPC remain migration provenance; dropping database objects needs a
separate usage audit and migration.
