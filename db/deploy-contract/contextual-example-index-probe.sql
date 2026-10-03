DO $context_index$
DECLARE predicate text; valid boolean; ready boolean; columns text; candidate text;
BEGIN
 SELECT pg_get_expr(i.indpred,i.indrelid),i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid,1,true)
 INTO predicate,valid,ready,columns FROM pg_index i
 WHERE i.indexrelid='private.platform_v2_content_nodes_active_raw_example_entry_idx'::regclass
 AND i.indrelid='private.platform_v2_content_nodes'::regclass;
 IF valid IS DISTINCT FROM true OR ready IS DISTINCT FROM true OR columns IS DISTINCT FROM 'entry_id'
   OR predicate IS NULL OR strpos(predicate,'example')=0 OR strpos(predicate,'active')=0
   OR strpos(predicate,'NULLIF(btrim(diagnostic_locator)')=0
   OR strpos(predicate,'^raw\.meanings\[[0-9]+\]\.examples\[[0-9]+\]$')=0 THEN
  RAISE EXCEPTION 'contextual example candidate index contract missing';
 END IF;
 SELECT prosrc INTO candidate FROM pg_proc
 WHERE oid='private.training_word_context_candidate_v1(uuid,uuid,text)'::regprocedure;
 IF strpos(candidate,'^raw\.meanings\[[0-9]+\]\.examples\[[0-9]+\]$')=0
   OR strpos(candidate,'NULLIF(btrim(example.diagnostic_locator)')=0
   OR strpos(candidate,'example.binding_state = ''active''')=0
   OR strpos(candidate,'example.kind = ''example''')=0 THEN
  RAISE EXCEPTION 'contextual example index predicate drifted from authoritative candidate';
 END IF;
END;
$context_index$;
