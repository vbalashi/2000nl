BEGIN;

ALTER TABLE public.admin_operators DROP CONSTRAINT admin_operators_permissions_allowed;
ALTER TABLE public.admin_operators ADD CONSTRAINT admin_operators_permissions_allowed CHECK (permissions <@ ARRAY['dictionaries.read','audit.read','publication.manage','dictionary.content.read','users.read','admission.manage','feedback.read','editorial.edit','notifications.manage','testers.manage']::text[]);
ALTER TABLE public.admin_audit_events DROP CONSTRAINT admin_audit_events_action_allowed;
ALTER TABLE public.admin_audit_events ADD CONSTRAINT admin_audit_events_action_allowed CHECK (action = ANY (ARRAY['auth.sign_in','auth.sign_in_denied','auth.sign_out','access.denied','dictionary.registry.read','dictionary.metadata.read','dictionary.content.read','dictionary.publication.updated','dictionary.audience.updated','audit.journal.read','user.registry.read','user.profile.read','admission.approve','admission.reject','admission.revoke','admission.invite','admission.mode','admission.auto_approve','feedback.registry.read','feedback.detail.read','operator.permissions.updated','notifications.configuration.read','notifications.configuration.updated','user.access.read','user.testers.added','user.testers.removed']::text[]));

CREATE FUNCTION public.admin_user_tester_access(
  p_operator uuid, p_user uuid, p_request uuid,
  p_member boolean DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  group_id_value uuid;
  group_name text;
  group_description text;
  operator_permissions text[];
  changed boolean;
BEGIN
  SELECT permissions INTO operator_permissions FROM public.admin_operators
    WHERE user_id = p_operator AND is_active FOR SHARE;
  IF NOT coalesce('users.read' = ANY(operator_permissions), false)
    OR (p_member IS NOT NULL AND NOT coalesce('testers.manage' = ANY(operator_permissions), false)) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  IF p_member IS NOT NULL THEN
    PERFORM 1 FROM auth.users WHERE id = p_user FOR NO KEY UPDATE;
  ELSE
    PERFORM 1 FROM auth.users WHERE id = p_user;
  END IF;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  SELECT id, name, nullif(btrim(description), '') INTO group_id_value, group_name, group_description
    FROM public.dictionary_access_groups WHERE key = 'testers' FOR SHARE;
  IF p_member IS NOT NULL AND group_id_value IS NULL THEN
    RETURN jsonb_build_object('error', 'group_unavailable');
  END IF;

  IF p_member IS NULL THEN
    INSERT INTO public.admin_audit_events(operator_user_id, action, outcome, target_type, target_id, request_id)
    VALUES (p_operator, 'user.access.read', 'success', 'user_profile', p_user::text, p_request);
  ELSE
    IF p_member THEN
      INSERT INTO public.dictionary_access_group_members(group_id, user_id)
      VALUES (group_id_value, p_user) ON CONFLICT DO NOTHING;
    ELSE
      DELETE FROM public.dictionary_access_group_members WHERE group_id = group_id_value AND user_id = p_user;
    END IF;
    changed := FOUND;
    IF changed THEN
      INSERT INTO public.admin_audit_events(operator_user_id, action, outcome, target_type, target_id, request_id)
      VALUES (p_operator, CASE WHEN p_member THEN 'user.testers.added' ELSE 'user.testers.removed' END,
        'success', 'user_profile', p_user::text, p_request);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'groups', CASE WHEN group_id_value IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object(
      'id', 'testers',
      'name', group_name,
      'description', group_description,
      'member', EXISTS (SELECT 1 FROM public.dictionary_access_group_members WHERE group_id = group_id_value AND user_id = p_user)
    )) END,
    'operatorActive', EXISTS (SELECT 1 FROM public.admin_operators WHERE user_id = p_user AND is_active)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_user_tester_access(uuid, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_tester_access(uuid, uuid, uuid, boolean) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
