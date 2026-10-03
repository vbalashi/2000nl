-- Dictionary publication lifecycle and named audience access.
-- Existing legacy system rows are explicitly mapped to general publication;
-- newly created dictionaries default to unpublished.

BEGIN;

ALTER TABLE public.admin_operators
  DROP CONSTRAINT IF EXISTS admin_operators_permissions_allowed;
ALTER TABLE public.admin_operators
  ADD CONSTRAINT admin_operators_permissions_allowed
  CHECK (permissions <@ ARRAY['dictionaries.read', 'audit.read', 'publication.manage']::text[]);

ALTER TABLE public.admin_audit_events
  DROP CONSTRAINT IF EXISTS admin_audit_events_action_allowed;
ALTER TABLE public.admin_audit_events
  ADD CONSTRAINT admin_audit_events_action_allowed CHECK (action IN (
    'auth.sign_in', 'auth.sign_in_denied', 'auth.sign_out', 'access.denied',
    'dictionary.registry.read', 'dictionary.metadata.read',
    'dictionary.publication.updated', 'dictionary.audience.updated', 'audit.journal.read'
  ));

ALTER TABLE public.dictionaries
  ADD COLUMN IF NOT EXISTS publication_state text NOT NULL DEFAULT 'unpublished'
    CHECK (publication_state IN ('unpublished', 'restricted', 'general'));

-- New rows stay unpublished by default. Legacy writers that explicitly set
-- visibility without the new field are mapped by the trigger below.
ALTER TABLE public.dictionaries ALTER COLUMN publication_state DROP DEFAULT;
ALTER TABLE public.dictionaries ALTER COLUMN visibility SET DEFAULT 'private';

UPDATE public.dictionaries
SET publication_state = CASE
  WHEN visibility IN ('system', 'public') THEN 'general'
  WHEN visibility = 'shared' THEN 'restricted'
  ELSE 'unpublished'
END
WHERE publication_state = 'unpublished';

CREATE OR REPLACE FUNCTION public.sync_dictionary_legacy_visibility()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.publication_state IS NULL THEN
    NEW.publication_state := CASE NEW.visibility
      WHEN 'system' THEN 'general' WHEN 'public' THEN 'general'
      WHEN 'shared' THEN 'restricted' ELSE 'unpublished' END;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.publication_state IS NOT DISTINCT FROM OLD.publication_state
     AND NEW.visibility IS DISTINCT FROM OLD.visibility THEN
    NEW.publication_state := CASE NEW.visibility
      WHEN 'system' THEN 'general' WHEN 'public' THEN 'general'
      WHEN 'shared' THEN 'restricted' ELSE 'unpublished' END;
  END IF;
  NEW.visibility := CASE NEW.publication_state
    WHEN 'general' THEN 'public'
    WHEN 'restricted' THEN 'shared'
    ELSE 'private'
  END;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_dictionary_publication_visibility ON public.dictionaries;
CREATE TRIGGER trg_dictionary_publication_visibility
  BEFORE INSERT OR UPDATE OF publication_state, visibility ON public.dictionaries
  FOR EACH ROW EXECUTE FUNCTION public.sync_dictionary_legacy_visibility();

CREATE TABLE IF NOT EXISTS public.dictionary_access_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE CHECK (key = lower(btrim(key)) AND key <> ''),
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dictionary_access_group_members (
  group_id uuid NOT NULL REFERENCES public.dictionary_access_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS dictionary_access_group_members_user_idx
  ON public.dictionary_access_group_members(user_id, group_id);

CREATE INDEX IF NOT EXISTS dictionaries_publication_state_idx
  ON public.dictionaries(publication_state, updated_at DESC);

CREATE OR REPLACE FUNCTION public.replace_dictionary_audience(
  p_dictionary_id uuid,
  p_group_keys text[] DEFAULT ARRAY[]::text[],
  p_user_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_keys text[] := ARRAY(SELECT DISTINCT lower(btrim(x)) FROM unnest(coalesce(p_group_keys, ARRAY[]::text[])) x WHERE btrim(x) <> '');
BEGIN
  IF EXISTS (SELECT 1 FROM unnest(v_keys) AS requested(key) WHERE key !~ '^[a-z0-9][a-z0-9_-]{0,63}$') THEN
    RAISE EXCEPTION 'invalid_dictionary_access_group_key';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dictionaries WHERE id = p_dictionary_id) THEN
    RAISE EXCEPTION 'dictionary_not_found';
  END IF;
  INSERT INTO public.dictionary_access_groups(key, name)
    SELECT x, x FROM unnest(v_keys) x ON CONFLICT (key) DO NOTHING;
  DELETE FROM public.dictionary_entitlements
    WHERE dictionary_id = p_dictionary_id AND permission = 'read' AND subject_type IN ('group', 'user');
  INSERT INTO public.dictionary_entitlements(dictionary_id, subject_type, subject_key, permission)
    SELECT p_dictionary_id, 'group', x, 'read' FROM unnest(v_keys) x;
  INSERT INTO public.dictionary_entitlements(dictionary_id, subject_type, subject_key, permission)
    SELECT p_dictionary_id, 'user', x::text, 'read' FROM unnest(coalesce(p_user_ids, ARRAY[]::uuid[])) x;
  RETURN jsonb_build_object('groupKeys', v_keys, 'userIds', coalesce(p_user_ids, ARRAY[]::uuid[]));
END;
$$;
REVOKE ALL ON FUNCTION public.replace_dictionary_audience(uuid, text[], uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_dictionary_audience(uuid, text[], uuid[]) TO service_role;

ALTER TABLE public.dictionary_access_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dictionary_access_group_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_access_dictionary(
  p_user_id uuid,
  p_dictionary_id uuid,
  p_permission text DEFAULT 'read'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
  v_dictionary public.dictionaries%rowtype;
  v_user_tier text;
  v_user_rank int;
  v_required_rank int;
BEGIN
  SELECT * INTO v_dictionary FROM public.dictionaries WHERE id = p_dictionary_id;
  IF NOT FOUND OR p_permission NOT IN ('read', 'write', 'admin') THEN RETURN false; END IF;
  IF p_user_id IS NOT NULL AND v_dictionary.owner_user_id = p_user_id THEN RETURN true; END IF;

  -- Publication state is an outer visibility gate. Entitlements and tiers
  -- refine access only while the dictionary is published.
  IF v_dictionary.publication_state = 'unpublished' THEN RETURN false; END IF;

  SELECT COALESCE(subscription_tier, 'free') INTO v_user_tier
    FROM public.user_settings WHERE user_id = p_user_id;
  v_user_tier := COALESCE(v_user_tier, 'free');
  v_user_rank := CASE v_user_tier WHEN 'admin' THEN 30 WHEN 'premium' THEN 20 ELSE 10 END;
  v_required_rank := CASE COALESCE(v_dictionary.minimum_subscription_tier, 'free')
    WHEN 'admin' THEN 30 WHEN 'premium' THEN 20 ELSE 10 END;

  IF p_permission = 'read' AND v_dictionary.publication_state = 'general'
     AND v_user_rank >= v_required_rank THEN RETURN true; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.dictionary_entitlements e
    WHERE e.dictionary_id = p_dictionary_id
      AND ((e.subject_type = 'user' AND e.subject_key = p_user_id::text)
        OR (e.subject_type = 'tier' AND e.subject_key = v_user_tier)
        OR (e.subject_type = 'group' AND EXISTS (
          SELECT 1 FROM public.dictionary_access_group_members gm
          JOIN public.dictionary_access_groups g ON g.id = gm.group_id
          WHERE gm.user_id = p_user_id AND g.key = e.subject_key
        )))
      AND (e.permission = p_permission OR e.permission = 'admin'
        OR (p_permission = 'read' AND e.permission = 'write'))
      AND (e.starts_at IS NULL OR e.starts_at <= now())
      AND (e.ends_at IS NULL OR e.ends_at > now())
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_access_dictionary(uuid, uuid, text) TO anon, authenticated;

-- Browse access is intentionally separate from training eligibility. General
-- publication permits dictionary lookup for every signed-in reader; premium
-- does not implicitly grant access to restricted sources.
CREATE OR REPLACE FUNCTION public.can_browse_dictionary(
  p_user_id uuid,
  p_dictionary_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
  v_dictionary public.dictionaries%rowtype;
BEGIN
  SELECT * INTO v_dictionary FROM public.dictionaries WHERE id = p_dictionary_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_user_id IS NOT NULL AND v_dictionary.owner_user_id = p_user_id THEN RETURN true; END IF;
  IF v_dictionary.kind = 'user' THEN RETURN false; END IF;
  IF v_dictionary.publication_state = 'general' THEN RETURN true; END IF;
  IF v_dictionary.publication_state <> 'restricted' OR p_user_id IS NULL THEN RETURN false; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.dictionary_entitlements e
    WHERE e.dictionary_id = p_dictionary_id
      AND e.subject_type IN ('user', 'group')
      AND ((e.subject_type = 'user' AND e.subject_key = p_user_id::text)
        OR (e.subject_type = 'group' AND EXISTS (
          SELECT 1 FROM public.dictionary_access_group_members gm
          JOIN public.dictionary_access_groups g ON g.id = gm.group_id
          WHERE gm.user_id = p_user_id AND g.key = e.subject_key
        )))
      AND e.permission IN ('read', 'write', 'admin')
      AND (e.starts_at IS NULL OR e.starts_at <= now())
      AND (e.ends_at IS NULL OR e.ends_at > now())
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.can_browse_dictionary(uuid, uuid) TO anon, authenticated;
-- Preserve the established helper-call shape in existing reader RPC bodies.
CREATE OR REPLACE FUNCTION public.can_browse_dictionary(
  p_user_id uuid,
  p_dictionary_id uuid,
  p_permission text
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT p_permission = 'read' AND public.can_browse_dictionary(p_user_id, p_dictionary_id)
$$;
GRANT EXECUTE ON FUNCTION public.can_browse_dictionary(uuid, uuid, text) TO anon, authenticated;
GRANT SELECT ON public.dictionary_access_groups, public.dictionary_access_group_members TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.dictionary_access_groups, public.dictionary_access_group_members FROM anon, authenticated;

COMMIT;
