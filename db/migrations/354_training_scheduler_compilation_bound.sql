BEGIN;
-- The bounded sharing helpers keep recursive authority expansion out of the
-- scheduler plan. This short interactive query must not spend seconds compiling
-- its large, fixed queue expression before selecting a single card.
-- This setting lasts only for the scheduler call, never for the connection.
ALTER FUNCTION private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean) SET jit=off;
COMMIT;
