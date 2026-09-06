# UI rollout profiles

`rollout-profiles.json` owns temporary build-time switches whose `legacy` and
`pilot` behavior intentionally differs. Stable product paths do not belong in
the profile.

The unified Details surface is V2-only after issue #252, so the obsolete
Library-only UI switch is no longer part of either profile. The `legacy`
profile remains for pre-#252 Training compatibility, but it is not compatible
with current unified Details because its server V2 lookup/actions controls are
off. Use `APP_ROLLOUT_PROFILE=pilot` for current Details. The production
workflow pins `pilot`, Docker Compose requires an explicit profile, and
`next.config.js` rejects unknown profile names; do not manually select
`legacy` for a #252 build.

Dictionary and list filtering is one such stable path. Both profiles use the
gated list/global search services, including Frozen and Don't show filters.
`NEXT_PUBLIC_DICTIONARY_SEARCH_V2` was never part of an approved profile and
was retired by issue #176 after the production runtime was verified not to set
it. Do not reintroduce that flag; a future search-contract rollout needs a new
owned issue, explicit filter parity, profile entries, exit criteria, and
deployment evidence.
