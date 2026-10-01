# Recent training history: latest 50 actions

Accepted by the owner on 2026-10-01 in the #407 conversation. The owner questioned
the inherited 24-hour limit and authorized omitting it. Current decision records
contain no accepted requirement for a 24-hour history window; the old limit is
an implementation detail recorded in the integration plan. Do not confuse this
with study-day statistics or active-time receipt validation.

Show the latest 50 accepted training actions across ordinary meanings, idioms and
sentence translation, regardless of age. Preserve learner isolation and dictionary
read access. Only accepted reviews and existing ordinary Learn events belong in
this projection; views, reports and other actions are not graded history.

Retain the legacy history RPC for older clients. New history uses an additive
read-only contract. Exercise text is shown only when the target and current node
fingerprints match; otherwise show the headword and localized exercise label,
never a guessed historical phrase or raw source context. No history backfill or
scheduling/state mutation is needed.

Status: implemented in migration 190 and shared history UI; local SQL and UI validation passed. Production deployment remains outside this checkpoint.
