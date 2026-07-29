# Focused Closure Review A

Verdict: `ACCEPT WITH REQUIRED CHANGES`
Mutations: none
P0 findings: none

Revision 2 closed the round-one findings. Three remaining P1 gaps were found:

1. Existing user-owned entries needed an explicit one-entry/one-private-group
   backfill before V2 exposure, with count, uniqueness, ownership, and privacy
   evidence.
2. Action idempotency needed to bind a key to the canonical payload, and
   generated-draft save needed a concrete retry identity returning the
   original permanent mapping.
3. Consumer-first rollback needed explicit behavior for an active V2 Known
   Mark so a V1 adapter could neither retrain nor mutate the protected card.

All three corrections are required before #70 starts.
