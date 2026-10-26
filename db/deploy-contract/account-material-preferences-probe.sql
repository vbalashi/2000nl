BEGIN READ ONLY;
DO $material$
DECLARE v_function regprocedure := 'public.save_account_material_preferences_v1(integer,jsonb)'::regprocedure;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.user_settings'::regclass AND attname='material_preferences' AND attnotnull AND NOT attisdropped)
  OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.user_settings'::regclass AND attname='material_preferences_revision' AND attnotnull AND NOT attisdropped)
  OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.user_settings'::regclass AND conname='user_settings_material_preferences_bounds' AND convalidated)
  OR (SELECT prosecdef FROM pg_proc WHERE oid=v_function)
  OR has_function_privilege('anon',v_function,'EXECUTE')
  OR NOT has_function_privilege('authenticated',v_function,'EXECUTE')
  OR NOT public.is_valid_account_material_preferences_v1('{"schemaVersion":1,"learningLanguages":[],"disabledDictionaryIds":[]}')
  OR public.is_valid_account_material_preferences_v1('{"schemaVersion":1,"learningLanguages":[{"code":"nl","paused":true}],"disabledDictionaryIds":[]}')
  OR public.is_valid_account_material_preferences_v1('{"schemaVersion":1,"learningLanguages":[{"code":"nl","paused":false},{"code":"nl","paused":false}],"disabledDictionaryIds":[]}') THEN
  RAISE EXCEPTION 'db-contract-gate: account material preferences boundary changed';
 END IF;
END;
$material$;
COMMIT;
