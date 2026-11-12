# Training meaning indicator

The ordinary meaning card keeps the entry's authoritative ordinal and a separate
optional total. The current-card permit still authorizes and returns one entry;
reading the article for presentation must not return sibling content through it.

A visible-row count alone is not a total. In particular, visible ordinals 1 and 2
could be a prefix of a larger shared group. `completeTrainingMeaningCount` accepts
a bounded complete training-group response only for a curated dictionary. This
restriction relies on `private.entry_access_v1`: curated entries all use the same
dictionary-level train permission. The source-group reader enumerates all active
bindings for that group. The validator also checks the complete-page marker,
matching dictionary and group identities, the exact target, distinct entry IDs,
and distinct source ordinals covering 1 through N.

User dictionaries have per-entry sharing. Their visible rows cannot prove full
membership, even when their ordinals are consecutive. Unknown dictionary kinds,
partial pages, over-bound groups and inconsistent identity also provide no total.
The current-card reader's pre-existing count is discarded before this optional
read, including when the read fails. Only a validated total is projected; the
exact entry remains renderable when a total is unavailable. Neither hidden entry
IDs nor a count of inaccessible members is added to the response.

If curated dictionaries acquire per-entry access rules, the curated completeness
assumption must be removed. Enabling other kinds requires a server-authoritative
full-membership/access check, not a client inference or just consecutive numbers.

History has its own access-checked batch projection. Keep its completeness and
source-identity semantics aligned without using history row positions as ordinals.
