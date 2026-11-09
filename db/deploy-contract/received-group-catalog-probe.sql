-- Read-only authority boundary for received group catalog scopes.
DO $received_group_catalog$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('public.read_personal_collection_catalog_v2(text,text,text,uuid,text,jsonb,integer,text)'::regprocedure);
 IF strpos(definition,'p_scope NOT IN(''all'',''unlabelled'',''label'',''group'')')=0
  OR strpos(definition,'subscription.access_lifetime=root.access_lifetime')=0
  OR strpos(definition,'subscription.user_id=principal AND subscription.is_active')=0
  OR strpos(definition,'root.owner_user_id<>principal AND root.is_open')=0
  OR strpos(definition,'group_root.id=path.root_id AND group_root.label_id=p_label_id')=0
  OR strpos(definition,'path.root_kind=''label''')=0 OR strpos(definition,'AND p_scope<>''group''')=0 THEN
  RAISE EXCEPTION 'db-contract-gate: received group catalog scope changed';
 END IF;
END;
$received_group_catalog$;
