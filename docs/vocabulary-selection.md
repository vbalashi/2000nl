# Vocabulary selection

Library and Session builder use the same vocabulary fields and POS catalogue. Training additionally owns exercises, directions, learning status, activity scope, session size and new/review balance. Library sorting affects display order, not the training queue.

The common order is source, vocabulary selection, entry type, part of speech, then meanings per entry. `Other` is a fallback for entries without a recognized POS; it does not claim that unresolved dictionary labels are a reliable expression/idiom/sentence taxonomy. Hidden word POS/article choices are ignored for Other. Abbreviations and prefixes use the existing `afk` and `vv` labels.

Frequency uses the external CGN spoken and SoNaR500 written spelling lists. `from` and `to` are one-based inclusive **retained global ranks**, before intersection with the user's accessible dictionaries. There is no refill outside the range or ranking invented for missing spellings. Corpus data and its loader are supplied separately; no corpus is included in this repository. An independent personal entry has no corpus rank merely because its spelling matches a source word. Without a supported explicit source link, personal entries remain unranked.

A spelling selects all its accessible dictionary units. First N meanings are taken in each existing source group/POS unit's dictionary order, then learning status and existing exercise eligibility narrow that set. A new-only session never replaces an already learned first or second meaning with the third. Existing pointer-only, introduction-order, access, archive and renderability rules remain authoritative. Attached idioms/examples use their explicit parent entry; no relationship is inferred from words occurring in an expression.

Library applies vocabulary predicates before grouping, counts and pagination. Frequency sorting places unknown ranks last, alphabetically; search match tiers retain priority. Cursor identity includes selection, profile and frequency-data revision. Exact article reads still return the authorized full article; the results list carries the selected entry IDs.

“Train these words” copies criteria into a new builder draft, including source, label, search query and active search category. It does not create a collection, save a recipe, launch a run or discard an owned session. Normal search categories are resolved once as a set of IDs using the same server search functions; they are not limited to the first result page. A–Z copies the same 31-entry centered neighborhood as Library. Display label names are excluded from semantic run/count identity. Live access and material preferences are re-evaluated at count/start, so revoked access or changed memberships cannot broaden a selection.

The builder availability strip counts all eligible due-now reviews, introduced reviews and new cards for its current draft. Session size, balance and new/review choice determine the eventual plan, not those three availability totals. Changes debounce for 250 ms, obsolete reads are cancelled, previous-recipe values are hidden, and failures are shown without fabricated zeros. Start is authoritative and does not implicitly save the edited draft.

DB293 adds private frequency tables and shared selection helpers. Fresh-install bootstrap and read-only probes cover the application contract. Managed forward migration/data provisioning and release authorization remain separate operational work; applying this fresh-install migration in a local QA environment is not a managed deployment.

Library handoff also pins its selected language for a collection, including collections whose primary language differs. A foreign-language draft reads a separate catalog while an owned run stays intact; the parent language switch is deferred until explicit Start. Word-search previews use server article-identity totals instead of hydrating every matching article just to count it. Filter reset keeps the independent display sorting.

## Source words for Idioms and Translation

The builder has a separate `sourceWordStatus` choice for Idioms and word-in-context
Translation. `learning` requires current ordinary-word learning on the exact parent
meaning, excluding active Known meanings. `all` accepts new, learning and Known
source words. Both choices retain source access, selected meanings, material,
content availability and exercise-specific card exclusions. The exercise's
new/review mix is independent of the source-word choice.

New setup/count/start requests explicitly default to `learning`. Stored legacy
runs without the field keep their previous eligibility; editing a setup does not
change an owned run. Ordinary meaning training ignores the remembered source-word
choice. Standalone sentence training remains paused.

The verified categories replacing the Other fallback are tracked in
[issue #66](https://github.com/vbalashi/2000nl/issues/66), pending complete dictionary
metadata. No guessed subtype is introduced from article text.

Contextual Translation retains ordinary reverse Known and exclusion behavior.
Including Already Know reverse cards with independently graded context progress is
deferred: changing candidate selection alone would produce cards that cannot be
graded. No Known mark is cleared by choosing All, and no second schedule is created.
The contextual help states this limit explicitly. Idioms already have their own
exercise state and can use Known parent meanings.
