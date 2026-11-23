BEGIN;

-- Owner is assigned only through the verified operator provisioning process.
-- A role grant includes the concrete permissions used by existing API and SQL checks.
CREATE FUNCTION private.admin_owner_permissions_v1() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT ARRAY['dictionaries.read','audit.read','publication.manage','dictionary.content.read',
    'users.read','admission.manage','feedback.read','editorial.edit','notifications.manage',
    'testers.manage','owner']::text[];
$$;
REVOKE ALL ON FUNCTION private.admin_owner_permissions_v1()
  FROM PUBLIC, anon, authenticated, authenticator, supabase_auth_admin;
GRANT EXECUTE ON FUNCTION private.admin_owner_permissions_v1() TO service_role;

ALTER TABLE public.admin_operators DROP CONSTRAINT admin_operators_permissions_allowed;
ALTER TABLE public.admin_operators ADD CONSTRAINT admin_operators_permissions_allowed CHECK (
  permissions <@ ARRAY['dictionaries.read','audit.read','publication.manage','dictionary.content.read',
    'users.read','admission.manage','feedback.read','editorial.edit','notifications.manage','testers.manage','owner']::text[]
  AND (NOT ('owner' = ANY(permissions)) OR private.admin_owner_permissions_v1() <@ permissions)
);

ALTER TABLE public.admin_audit_events DROP CONSTRAINT admin_audit_events_action_allowed;
ALTER TABLE public.admin_audit_events ADD CONSTRAINT admin_audit_events_action_allowed CHECK (
  action = ANY (ARRAY[
    'auth.sign_in','auth.sign_in_denied','auth.sign_out','access.denied',
    'dictionary.registry.read','dictionary.metadata.read','dictionary.content.read',
    'dictionary.publication.updated','dictionary.audience.updated','audit.journal.read',
    'user.registry.read','user.profile.read','admission.approve','admission.reject',
    'admission.revoke','admission.invite','admission.mode','admission.auto_approve',
    'feedback.registry.read','feedback.detail.read','operator.permissions.updated',
    'notifications.configuration.read','notifications.configuration.updated','user.access.read',
    'user.activity.read','user.testers.added','user.testers.removed',
    'user.group.added','user.group.removed'
  ]::text[])
);

CREATE FUNCTION public.admin_owner_user_access_v1(
  p_operator uuid, p_user uuid, p_request uuid, p_group_id text, p_member boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  selected_group uuid;
  tester_result jsonb;
BEGIN
  PERFORM 1 FROM public.admin_operators
   WHERE user_id=p_operator AND is_active AND 'owner'=ANY(permissions) FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','forbidden'); END IF;

  IF (p_member IS NULL) <> (p_group_id IS NULL) THEN
    RETURN jsonb_build_object('error','invalid_request');
  END IF;
  IF p_member IS NULL THEN
    PERFORM 1 FROM auth.users WHERE id=p_user FOR KEY SHARE;
    IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
    INSERT INTO public.admin_audit_events(operator_user_id,action,outcome,target_type,target_id,request_id)
    VALUES(p_operator,'user.access.read','success','user_profile',p_user::text,p_request);
  ELSIF p_group_id='testers' THEN
    tester_result := public.admin_user_tester_access(p_operator, p_user, p_request, p_member);
    IF tester_result ? 'error' THEN RETURN tester_result; END IF;
  ELSE
    IF p_group_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RETURN jsonb_build_object('error','invalid_request');
    END IF;
    PERFORM 1 FROM auth.users WHERE id=p_user FOR NO KEY UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
    SELECT id INTO selected_group FROM public.dictionary_access_groups
    WHERE id=p_group_id::uuid AND key <> 'testers' FOR SHARE;
    IF NOT FOUND THEN RETURN jsonb_build_object('error','group_unavailable'); END IF;
    IF p_member THEN
      INSERT INTO public.dictionary_access_group_members(group_id,user_id)
      VALUES(selected_group,p_user) ON CONFLICT DO NOTHING;
    ELSE
      DELETE FROM public.dictionary_access_group_members WHERE group_id=selected_group AND user_id=p_user;
    END IF;
    IF FOUND THEN
      INSERT INTO public.admin_audit_events(operator_user_id,action,outcome,target_type,target_id,request_id)
      VALUES(p_operator,CASE WHEN p_member THEN 'user.group.added' ELSE 'user.group.removed' END,
        'success','user_group_membership',p_user::text || '/' || selected_group::text,p_request);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'groups', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',CASE WHEN g.key='testers' THEN 'testers' ELSE g.id::text END,
      'name',g.name,'description',nullif(btrim(g.description),''),
      'member',m.user_id IS NOT NULL) ORDER BY g.name,g.id),'[]'::jsonb)
      FROM public.dictionary_access_groups g LEFT JOIN public.dictionary_access_group_members m
      ON m.group_id=g.id AND m.user_id=p_user),
    'operatorActive', EXISTS(SELECT 1 FROM public.admin_operators WHERE user_id=p_user AND is_active)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_owner_user_access_v1(uuid,uuid,uuid,text,boolean)
  FROM PUBLIC, anon, authenticated, authenticator, supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.admin_owner_user_access_v1(uuid,uuid,uuid,text,boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.admin_user_access_details_v1(p_operator uuid, p_user uuid, p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  capabilities text[];
  history jsonb;
  assigned jsonb;
  operator_permissions jsonb;
BEGIN
  SELECT permissions INTO capabilities FROM public.admin_operators
  WHERE user_id=p_operator AND is_active FOR SHARE;
  IF NOT COALESCE('users.read'=ANY(capabilities),false) THEN
    RETURN jsonb_build_object('error','forbidden');
  END IF;
  PERFORM 1 FROM auth.users WHERE id=p_user FOR KEY SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;

  SELECT CASE WHEN o.is_active THEN to_jsonb(o.permissions) ELSE '[]'::jsonb END INTO operator_permissions
  FROM public.admin_operators o WHERE o.user_id=p_user;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',g.key,'name',g.name,'description',NULLIF(btrim(g.description),''))
    ORDER BY g.name,g.key),'[]'::jsonb) INTO assigned
  FROM public.dictionary_access_group_members m JOIN public.dictionary_access_groups g ON g.id=m.group_id
  WHERE m.user_id=p_user AND g.key <> 'testers';

  IF 'audit.read'=ANY(capabilities) THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('at',h.created_at,'action',h.action,'operatorId',h.operator_user_id,'groupName',g.name)
      ORDER BY h.created_at DESC,h.id DESC),'[]'::jsonb) INTO history
    FROM (
      SELECT a.created_at,a.id,a.action,a.operator_user_id,a.target_id
      FROM public.admin_audit_events a
      WHERE a.outcome='success' AND (
        (a.target_type='user_profile' AND a.target_id=p_user::text
          AND a.action IN ('user.testers.added','user.testers.removed'))
        OR (a.target_type='user_group_membership' AND a.target_id LIKE p_user::text || '/%'
          AND a.action IN ('user.group.added','user.group.removed'))
      )
      ORDER BY a.created_at DESC,a.id DESC LIMIT 20
    ) h LEFT JOIN public.dictionary_access_groups g ON g.id::text=split_part(h.target_id,'/',2);
  END IF;

  INSERT INTO public.admin_audit_events(operator_user_id,action,outcome,target_type,target_id,request_id)
  VALUES (p_operator,'user.access.read','success','user_profile',p_user::text,p_request);
  RETURN jsonb_build_object('assignedGroups',assigned,'operatorPermissions',COALESCE(operator_permissions,'[]'::jsonb),'history',history);
END;
$$;
NOTIFY pgrst, 'reload schema';

COMMIT;
