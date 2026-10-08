-- Familiarity is durable without manufacturing FSRS ratings or altering Known.
BEGIN;
CREATE OR REPLACE FUNCTION private.enroll_familiar_meaning_directions_v1(p_user_id uuid,p_entry_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private,pg_temp AS $$
BEGIN
 INSERT INTO public.user_card_status(user_id,entry_id,card_type_id,fsrs_enabled,next_review_at,in_learning,seen_count)
 SELECT p_user_id,p_entry_id,direction,true,private.training_reference_now_v1(),true,0
 FROM unnest(ARRAY['word-to-definition','definition-to-word']) direction
 WHERE NOT EXISTS(SELECT 1 FROM public.user_card_known_marks k WHERE k.user_id=p_user_id AND k.entry_id=p_entry_id AND k.card_type_id=direction AND k.cleared_at IS NULL)
 ON CONFLICT(user_id,entry_id,card_type_id) DO UPDATE
 SET fsrs_enabled=true,in_learning=true,next_review_at=COALESCE(user_card_status.next_review_at,EXCLUDED.next_review_at)
 WHERE user_card_status.fsrs_last_grade IS NULL AND NOT user_card_status.fsrs_enabled;
END;$$;
REVOKE ALL ON FUNCTION private.enroll_familiar_meaning_directions_v1(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION private.known_meaning_familiarity_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private,pg_temp AS $$
BEGIN
 IF NEW.card_type_id IN ('word-to-definition','definition-to-word') THEN
  PERFORM private.enroll_familiar_meaning_directions_v1(NEW.user_id,NEW.entry_id);
 END IF;
 RETURN NEW;
END;$$;
REVOKE ALL ON FUNCTION private.known_meaning_familiarity_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER known_meaning_familiarity AFTER INSERT OR UPDATE OF cleared_at ON public.user_card_known_marks
 FOR EACH ROW EXECUTE FUNCTION private.known_meaning_familiarity_v1();
-- The history retains cleared marks, so undo-all and old manual Known decisions
-- can restore familiarity without rewriting old event receipts or review counts.
DO $$ DECLARE target record; BEGIN
 FOR target IN SELECT DISTINCT user_id,entry_id FROM public.user_card_known_marks WHERE card_type_id IN ('word-to-definition','definition-to-word') LOOP
  PERFORM private.enroll_familiar_meaning_directions_v1(target.user_id,target.entry_id);
 END LOOP;
END;$$;
COMMIT;
