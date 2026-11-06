DO $probe$
DECLARE f regprocedure;
BEGIN
 FOREACH f IN ARRAY ARRAY[
  'private.vocabulary_written_pos_orders_v1(uuid[],text)'::regprocedure,
  'private.vocabulary_written_pos_order_v1(uuid,text)'::regprocedure
 ] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=f AND prosecdef AND provolatile='s')
   OR has_function_privilege('service_role',f,'EXECUTE')
   OR has_function_privilege('authenticated',f,'EXECUTE')
   OR has_function_privilege('anon',f,'EXECUTE') THEN
   RAISE EXCEPTION 'written_pos_helper_contract';
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_class WHERE oid IN (
  'private.vocabulary_written_pos_profiles'::regclass,'private.vocabulary_written_pos_frequencies'::regclass)
  AND (NOT relrowsecurity OR has_table_privilege('anon',oid,'SELECT')
   OR has_table_privilege('authenticated',oid,'SELECT') OR has_table_privilege('service_role',oid,'SELECT')))
  OR position('vocabulary_written_pos_profiles' IN pg_get_functiondef('private.vocabulary_frequency_revision_v1()'::regprocedure))=0 THEN
  RAISE EXCEPTION 'written_pos_resource_contract';
 END IF;
END;
$probe$;
