# Training state presentation

Owner pass after #574: no-due hero had normal Start above a no-due message, with Review ahead rendered as a weak text action below. Error state retained fixed slate/indigo styles.

The no-due state now presents message before actions, replaces normal hero Start with Review ahead, and keeps Adjust secondary. Exhausted early selection only offers Adjust. Saved recipe launch remains available. Shared failure/empty/loading panel uses current practice theme tokens rather than fixed colors; retry semantics unchanged.

Validation: 63 focused component tests, typecheck, focused lint, 3 full application/controller browser scenarios. Desktop and Russian320 no-due screenshots plus mobile390 failure screenshot. Controlled fixtures; not proof that the original production failure is fixed.

Diagnosis: public production health and contract207 were healthy. Owner Chrome logs had stats/start errors, but response bodies before monitor attachment were unavailable. Failed stats/start fixtures did not reproduce this exact overview failure; failing prerequisite language catalog did. Production root cause remains open; capture failing request/status/body next occurrence, distinguish catalog/auth/transient transport, then add regression at confirmed seam. No user answers submitted. No forced reload of owner's active session. Current browser network monitoring enabled.
