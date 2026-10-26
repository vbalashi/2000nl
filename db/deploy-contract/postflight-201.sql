\i db/deploy-contract/postflight-200.sql

DO $dictionary_publication_201$
DECLARE
  permissions_check text;
  audit_check text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dictionaries'
      AND column_name = 'publication_state'
  ) THEN
    RAISE EXCEPTION 'dictionary publication state column is missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid IN ('public.dictionary_access_groups'::regclass,
                  'public.dictionary_access_group_members'::regclass)
      AND NOT relrowsecurity
  ) THEN
    RAISE EXCEPTION 'dictionary audience tables must keep RLS enabled';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.can_browse_dictionary(uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.can_browse_dictionary(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'dictionary browse helper grants are incomplete';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.dictionaries
    WHERE publication_state NOT IN ('unpublished', 'restricted', 'general')
  ) THEN
    RAISE EXCEPTION 'dictionary publication state contains an invalid value';
  END IF;

  SELECT pg_get_constraintdef(oid) INTO permissions_check
  FROM pg_constraint
  WHERE conrelid = 'public.admin_operators'::regclass
    AND conname = 'admin_operators_permissions_allowed';
  SELECT pg_get_constraintdef(oid) INTO audit_check
  FROM pg_constraint
  WHERE conrelid = 'public.admin_audit_events'::regclass
    AND conname = 'admin_audit_events_action_allowed';
  IF permissions_check IS NULL OR permissions_check NOT LIKE '%dictionary.content.read%'
     OR audit_check IS NULL OR audit_check NOT LIKE '%dictionary.content.read%' THEN
    RAISE EXCEPTION 'dictionary content inspection permission or audit action is missing';
  END IF;
END
$dictionary_publication_201$;
