DO $$
DECLARE base jsonb := '{"mode":"all","materialKinds":[],"profile":"spoken","from":1,"to":100,"meanings":1}'::jsonb;
BEGIN
 IF NOT private.valid_vocabulary_selection_v1(jsonb_set(base,'{meanings}','4'::jsonb))
 OR NOT private.valid_vocabulary_selection_v1(jsonb_set(base,'{meanings}','5'::jsonb))
 OR private.valid_vocabulary_selection_v1(jsonb_set(base,'{meanings}','6'::jsonb)) THEN
  RAISE EXCEPTION 'Vocabulary meaning limits are incompatible';
 END IF;
END $$;
