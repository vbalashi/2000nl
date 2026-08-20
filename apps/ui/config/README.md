# UI rollout profiles

`rollout-profiles.json` owns temporary build-time switches whose `legacy` and
`pilot` behavior intentionally differs. Stable product paths do not belong in
the profile.

Dictionary and list filtering is one such stable path. Both profiles use the
gated list/global search services, including Frozen and Don't show filters.
`NEXT_PUBLIC_DICTIONARY_SEARCH_V2` was never part of an approved profile and
was retired by issue #176 after the production runtime was verified not to set
it. Do not reintroduce that flag; a future search-contract rollout needs a new
owned issue, explicit filter parity, profile entries, exit criteria, and
deployment evidence.
