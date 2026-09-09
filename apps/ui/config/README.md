# UI rollout profiles

`rollout-profiles.json` owns the one remaining build-time profile, `pilot`.
Stable product paths do not belong in the profile.

The unified Details and Training surfaces are current V2 paths after issue
#252. `pilot` enables their approved server and client flags. The production
workflow pins `pilot`, Docker Compose requires an explicit profile, and
`next.config.js` rejects unknown profile names. A stale `legacy` value now
fails before the build; remove it from local environment files.

Dictionary and list filtering is one such stable path. The profile uses the
gated list/global search services, including Frozen and Don't show filters.
`NEXT_PUBLIC_DICTIONARY_SEARCH_V2` was never part of an approved profile and
was retired by issue #176 after the production runtime was verified not to set
it. Do not reintroduce that flag; a future search-contract rollout needs a new
owned issue, explicit filter parity, profile entries, exit criteria, and
deployment evidence.
