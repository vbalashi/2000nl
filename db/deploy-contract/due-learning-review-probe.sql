DO $due_learning$
DECLARE body text;
BEGIN
 SELECT prosrc INTO body FROM pg_proc WHERE oid='private.training_scheduler_candidates_v2(uuid,text[],uuid,text,text,text,uuid[],text[],jsonb,boolean,boolean)'::regprocedure;
 IF strpos(body,$needle$WHEN intrinsic_source='learning' AND p_card_filter IN ('both','review') THEN 'learning'$needle$)=0
  OR strpos(body,$needle$WHEN intrinsic_source='new' AND p_card_filter<>'review' THEN 'new'$needle$)=0
  OR strpos(body,'private.training_review_early_v1')=0 THEN
  RAISE EXCEPTION 'due learning review/new/early boundaries missing';
 END IF;
END;
$due_learning$;
