DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM information_schema.columns
   WHERE table_schema='private' AND table_name='app_release_notes'
     AND column_name='audiences' AND is_nullable='NO')
 OR NOT has_function_privilege('service_role','public.read_admin_app_release_notes_v1(text,text,integer,text)','execute')
 OR has_function_privilege('anon','public.read_admin_app_release_notes_v1(text,text,integer,text)','execute')
 OR has_function_privilege('authenticated','public.set_app_release_audiences_v1(text,text[])','execute')
 OR has_function_privilege('service_role','private.read_app_release_catalog(text,text,integer,text,boolean)','execute')
 THEN RAISE EXCEPTION 'release_notes_audience_boundary'; END IF;
END $$;
