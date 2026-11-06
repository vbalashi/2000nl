BEGIN;
CREATE OR REPLACE FUNCTION private.valid_vocabulary_selection_v1(p_value jsonb) RETURNS boolean
 LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF p_value IS NULL THEN RETURN true; END IF;
 IF jsonb_typeof(p_value)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(p_value))<>6
  OR NOT(p_value ?& ARRAY['mode','materialKinds','profile','from','to','meanings'])
  OR p_value->>'mode' NOT IN ('all','frequency') OR p_value->>'profile' NOT IN ('spoken','written')
  OR jsonb_typeof(p_value->'mode')<>'string' OR jsonb_typeof(p_value->'profile')<>'string'
  OR jsonb_typeof(p_value->'from')<>'number' OR jsonb_typeof(p_value->'to')<>'number'
  OR p_value->>'from' !~ '^[1-9][0-9]{0,15}$' OR p_value->>'to' !~ '^[1-9][0-9]{0,15}$'
  OR (p_value->>'to')::bigint>9007199254740991 OR (p_value->>'from')::bigint>(p_value->>'to')::bigint
  OR NOT(p_value->'meanings' IN ('1'::jsonb,'2'::jsonb,'3'::jsonb,'4'::jsonb,'5'::jsonb,'"all"'::jsonb))
  OR jsonb_typeof(p_value->'materialKinds')<>'array' THEN RETURN false; END IF;
 IF jsonb_array_length(p_value->'materialKinds')>1 OR EXISTS (
  SELECT 1 FROM jsonb_array_elements(p_value->'materialKinds') x WHERE jsonb_typeof(x)<>'string' OR x#>>'{}' NOT IN ('word','other')) THEN RETURN false; END IF;
 RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END;
$$;
COMMIT;
