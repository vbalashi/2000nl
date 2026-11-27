BEGIN;

CREATE TABLE private.assistant_allowance_defaults (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  ai_replies integer NOT NULL CHECK (ai_replies BETWEEN 0 AND 10000),
  dictations integer NOT NULL CHECK (dictations BETWEEN 0 AND 10000),
  sandbox_premium_for_meanings boolean NOT NULL DEFAULT false
);
INSERT INTO private.assistant_allowance_defaults (ai_replies,dictations) VALUES (2,10);

CREATE TABLE private.assistant_allowance_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ai_replies integer NOT NULL CHECK (ai_replies >= 0),
  dictations integer NOT NULL CHECK (dictations >= 0)
);

CREATE TABLE private.assistant_allowance_operations (
  user_id uuid NOT NULL REFERENCES private.assistant_allowance_accounts(user_id) ON DELETE CASCADE,
  operation_id uuid NOT NULL,
  feature text NOT NULL CHECK (feature IN ('ai_reply','dictation')),
  charged boolean NOT NULL,
  state text NOT NULL CHECK (state IN ('reserved','succeeded','released')),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (user_id,operation_id)
);
CREATE INDEX assistant_allowance_operations_pending
  ON private.assistant_allowance_operations (user_id,expires_at) WHERE state='reserved';

-- Operator-issued grants stay separate from signed Paddle subscription periods.
CREATE TABLE private.manual_premium_grants (
  request_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operator_id uuid NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  valid_until timestamptz NOT NULL CHECK (isfinite(valid_until) AND valid_until > granted_at),
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 500)
);
CREATE INDEX manual_premium_grants_user_end ON private.manual_premium_grants (user_id,valid_until DESC);

CREATE TABLE private.assistant_allowance_grants (
  request_id uuid PRIMARY KEY,
  user_id uuid,
  group_id uuid,
  operator_id uuid NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  ai_replies integer NOT NULL CHECK (ai_replies BETWEEN 0 AND 10000),
  dictations integer NOT NULL CHECK (dictations BETWEEN 0 AND 10000),
  granted_users integer NOT NULL DEFAULT 0 CHECK (granted_users >= 0),
  CHECK ((user_id IS NULL) <> (group_id IS NULL)),
  CHECK (ai_replies + dictations > 0)
);
CREATE TABLE private.assistant_allowance_grant_recipients (
  request_id uuid NOT NULL REFERENCES private.assistant_allowance_grants(request_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (request_id,user_id)
);
CREATE INDEX assistant_allowance_grant_recipients_user ON private.assistant_allowance_grant_recipients (user_id);

ALTER TABLE private.assistant_allowance_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.assistant_allowance_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.assistant_allowance_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.assistant_allowance_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.assistant_allowance_grant_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.manual_premium_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.assistant_allowance_defaults, private.assistant_allowance_accounts,
  private.assistant_allowance_operations, private.assistant_allowance_grants,
  private.assistant_allowance_grant_recipients, private.manual_premium_grants
  FROM PUBLIC,anon,authenticated,service_role,authenticator,supabase_auth_admin;

CREATE FUNCTION private.manual_premium_until_v1(p_user uuid, p_at timestamptz)
RETURNS timestamptz LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT max(valid_until) FROM private.manual_premium_grants
  WHERE user_id=p_user AND valid_until>p_at;
$$;

CREATE FUNCTION private.effective_learning_tier_v1(p_user uuid,p_at timestamptz)
RETURNS text LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT CASE
    WHEN legacy.tier IN ('premium','admin') THEN legacy.tier
    WHEN private.manual_premium_until_v1(p_user,p_at) IS NOT NULL THEN 'premium'
    ELSE coalesce(legacy.tier,'free')
  END
  FROM (SELECT (SELECT subscription_tier FROM public.user_settings WHERE user_id=p_user) AS tier) legacy;
$$;

CREATE OR REPLACE FUNCTION public.get_user_tier(p_user_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR p_user_id IS DISTINCT FROM (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
  END IF;
  RETURN private.effective_learning_tier_v1(p_user_id,statement_timestamp());
END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_dictionary(p_user_id uuid, p_dictionary_id uuid, p_permission text DEFAULT 'read'::text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
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

  v_user_tier := private.effective_learning_tier_v1(p_user_id,statement_timestamp());
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
      AND (v_dictionary.publication_state <> 'restricted' OR e.subject_type <> 'tier')
      AND (e.starts_at IS NULL OR e.starts_at <= now())
      AND (e.ends_at IS NULL OR e.ends_at > now())
  );
END;
$$;

-- Reuse the existing signed-period resolver for trusted balance checks.
CREATE FUNCTION private.paddle_sandbox_access_v1(p_user uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  WITH owned AS (
    SELECT DISTINCT ON (paid.subscription_id)
      paid.subscription_id, paid.transaction_id, attempt.price_id, attempt.plan
    FROM private.paddle_sandbox_attempts attempt
    JOIN private.paddle_sandbox_events paid
      ON paid.transaction_id = attempt.transaction_id AND paid.kind = 'payment'
      AND paid.price_id = attempt.price_id AND NOT paid.renewal
    WHERE attempt.user_id = p_user
    ORDER BY paid.subscription_id, paid.occurred_at, paid.event_id
  ), periods AS (
    SELECT owned.plan, owned.subscription_id,
      coalesce(paid.valid_from, first_period.valid_from) AS starts_at,
      least(coalesce(paid.valid_until, first_period.valid_until), terminal.cancel_at, state.cancel_at) AS ends_at,
      terminal.cancel_at IS NOT NULL OR state.cancel_at IS NOT NULL AS ends_after_cancel
    FROM owned
    JOIN private.paddle_sandbox_events paid ON paid.subscription_id = owned.subscription_id
      AND paid.kind = 'payment' AND paid.price_id = owned.price_id
      AND (paid.transaction_id = owned.transaction_id OR paid.renewal)
    LEFT JOIN LATERAL (
      SELECT e.valid_from, e.valid_until FROM private.paddle_sandbox_events e
      WHERE e.kind = 'created' AND e.subscription_id = owned.subscription_id
        AND e.transaction_id = owned.transaction_id AND e.transaction_id = paid.transaction_id
        AND e.price_id = owned.price_id
      ORDER BY e.occurred_at, e.event_id LIMIT 1
    ) first_period ON paid.valid_until IS NULL
    LEFT JOIN LATERAL (
      SELECT min(e.cancel_at) AS cancel_at FROM private.paddle_sandbox_events e
      WHERE e.kind = 'subscription' AND e.subscription_id = owned.subscription_id AND e.terminal
    ) terminal ON true
    LEFT JOIN LATERAL (
      SELECT e.cancel_at FROM private.paddle_sandbox_events e
      WHERE e.kind = 'subscription' AND e.subscription_id = owned.subscription_id AND NOT e.terminal
      ORDER BY e.occurred_at DESC, e.event_id DESC LIMIT 1
    ) state ON true
    WHERE coalesce((
      SELECT sum(refund.amount)
      FROM (
        SELECT DISTINCT ON (e.adjustment_id) e.amount
        FROM private.paddle_sandbox_events e
        WHERE e.kind = 'refund' AND e.transaction_id = paid.transaction_id AND e.currency = paid.currency
        ORDER BY e.adjustment_id, e.occurred_at DESC, e.event_id DESC
      ) refund
    ), 0) < paid.amount
  )
  SELECT coalesce((
    SELECT jsonb_build_object('active', true, 'plan', plan, 'validUntil', ends_at, 'endsAfterCancel', ends_after_cancel, 'subscriptionId', subscription_id)
    FROM periods WHERE starts_at <= statement_timestamp() AND ends_at > statement_timestamp()
      AND starts_at IS NOT NULL
    ORDER BY ends_at DESC, plan, subscription_id LIMIT 1
  ), jsonb_strip_nulls(jsonb_build_object('active', false, 'subscriptionId', (
    SELECT subscription_id FROM owned
    JOIN private.paddle_sandbox_attempts attempt USING (transaction_id)
    ORDER BY attempt.created_at DESC, owned.subscription_id LIMIT 1
  ))));
$$;

CREATE OR REPLACE FUNCTION public.read_paddle_sandbox_access()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT private.paddle_sandbox_access_v1((SELECT auth.uid()));
$$;

-- Count persisted live meanings once per owner, across every language and dictionary.
-- Lock writers until the backfill and row-level accounting trigger are both installed.
LOCK TABLE public.dictionaries, public.word_entries IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE private.personal_meaning_usage (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  meaning_count integer NOT NULL CHECK (meaning_count >= 0)
);
INSERT INTO private.personal_meaning_usage (user_id,meaning_count)
SELECT d.owner_user_id,count(*)
FROM public.word_entries w
JOIN public.dictionaries d ON d.id=w.dictionary_id AND d.kind='user'
WHERE w.management_kind='user' AND w.archived_at IS NULL AND d.owner_user_id IS NOT NULL
GROUP BY d.owner_user_id;

ALTER TABLE private.personal_meaning_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.personal_meaning_usage
  FROM PUBLIC,anon,authenticated,service_role,authenticator,supabase_auth_admin;

CREATE FUNCTION private.adjust_personal_meaning_usage_v1(p_previous uuid,p_next uuid,p_count integer)
RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE unlimited boolean;
BEGIN
  IF p_previous IS NOT DISTINCT FROM p_next OR p_count=0 THEN RETURN; END IF;

  -- A true transfer locks both owner rows in the same order.
  IF p_previous IS NOT NULL AND p_next IS NOT NULL THEN
    INSERT INTO private.personal_meaning_usage(user_id,meaning_count)
    SELECT u,0 FROM unnest(ARRAY[p_previous,p_next]) AS ids(u) ORDER BY u
    ON CONFLICT (user_id) DO NOTHING;
    PERFORM 1 FROM private.personal_meaning_usage
      WHERE user_id=ANY(ARRAY[p_previous,p_next]) ORDER BY user_id FOR UPDATE;
  END IF;

  IF p_previous IS NOT NULL THEN
    UPDATE private.personal_meaning_usage SET meaning_count=meaning_count-p_count WHERE user_id=p_previous;
  END IF;
  IF p_next IS NULL THEN RETURN; END IF;

  unlimited:=private.effective_learning_tier_v1(p_next,statement_timestamp()) IN ('premium','admin');
  IF NOT unlimited AND (SELECT sandbox_premium_for_meanings FROM private.assistant_allowance_defaults WHERE singleton) THEN
    unlimited:=(private.paddle_sandbox_access_v1(p_next)->>'active')::boolean;
  END IF;
  IF NOT unlimited AND p_count>100 THEN
    RAISE EXCEPTION 'personal_meaning_allowance_exhausted' USING ERRCODE='P0001';
  END IF;
  INSERT INTO private.personal_meaning_usage AS u(user_id,meaning_count)
  VALUES(p_next,p_count)
  ON CONFLICT (user_id) DO UPDATE SET meaning_count=u.meaning_count+p_count
  WHERE unlimited OR u.meaning_count<=100-p_count;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'personal_meaning_allowance_exhausted' USING ERRCODE='P0001';
  END IF;
END;
$$;

CREATE FUNCTION private.track_personal_meaning_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE old_owner uuid; new_owner uuid;
BEGIN
  IF TG_OP='UPDATE' AND ROW(OLD.dictionary_id,OLD.management_kind,OLD.archived_at)
     IS NOT DISTINCT FROM ROW(NEW.dictionary_id,NEW.management_kind,NEW.archived_at) THEN
    RETURN NULL;
  END IF;
  IF TG_OP<>'INSERT' AND OLD.management_kind='user' AND OLD.archived_at IS NULL THEN
    SELECT owner_user_id INTO old_owner FROM public.dictionaries WHERE id=OLD.dictionary_id AND kind='user';
  END IF;
  IF TG_OP<>'DELETE' AND NEW.management_kind='user' AND NEW.archived_at IS NULL THEN
    SELECT owner_user_id INTO new_owner FROM public.dictionaries WHERE id=NEW.dictionary_id AND kind='user';
  END IF;
  PERFORM private.adjust_personal_meaning_usage_v1(old_owner,new_owner,1);
  RETURN NULL;
END;
$$;

CREATE TRIGGER track_personal_meaning_usage
AFTER INSERT OR DELETE OR UPDATE OF dictionary_id,management_kind,archived_at ON public.word_entries
FOR EACH ROW EXECUTE FUNCTION private.track_personal_meaning_v1();

CREATE FUNCTION private.track_personal_dictionary_owner_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE old_owner uuid; new_owner uuid; active_meanings integer;
BEGIN
  IF OLD.kind='user' THEN old_owner:=OLD.owner_user_id; END IF;
  IF NEW.kind='user' THEN new_owner:=NEW.owner_user_id; END IF;
  IF old_owner IS DISTINCT FROM new_owner THEN
    SELECT count(*) INTO active_meanings FROM public.word_entries
    WHERE dictionary_id=OLD.id AND management_kind='user' AND archived_at IS NULL;
    PERFORM private.adjust_personal_meaning_usage_v1(old_owner,new_owner,active_meanings);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER track_personal_dictionary_owner
BEFORE UPDATE OF owner_user_id,kind ON public.dictionaries
FOR EACH ROW EXECUTE FUNCTION private.track_personal_dictionary_owner_v1();

CREATE FUNCTION private.read_assistant_allowances_v1(p_user uuid,p_allow_sandbox boolean,p_at timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  WITH availability AS (
    SELECT coalesce(a.ai_replies,d.ai_replies) AS ai_replies,
      coalesce(a.dictations,d.dictations) AS dictations,
      greatest(0,100-coalesce(m.meaning_count,0)) AS remaining_meanings,
      private.manual_premium_until_v1(p_user,p_at) AS manual_until,
      coalesce(s.subscription_tier IN ('premium','admin'),false) AS legacy_premium
    FROM private.assistant_allowance_defaults d
    LEFT JOIN private.assistant_allowance_accounts a ON a.user_id=p_user
    LEFT JOIN private.personal_meaning_usage m ON m.user_id=p_user
    LEFT JOIN public.user_settings s ON s.user_id=p_user
    WHERE d.singleton
  ), expired AS (
    SELECT count(*) FILTER (WHERE feature='ai_reply') AS ai_replies,
      count(*) FILTER (WHERE feature='dictation') AS dictations
    FROM private.assistant_allowance_operations
    WHERE user_id=p_user AND state='reserved' AND expires_at<=p_at AND charged
  )
  SELECT jsonb_build_object(
    'premium', legacy_premium OR manual_until IS NOT NULL OR
      CASE WHEN p_allow_sandbox IS TRUE THEN (private.paddle_sandbox_access_v1(p_user)->>'active')::boolean ELSE false END,
    'manualUntil',manual_until,
    'aiRepliesRemaining',availability.ai_replies+expired.ai_replies,
    'dictationsRemaining',availability.dictations+expired.dictations,
    'personalMeaningsRemaining',remaining_meanings
  )
  FROM availability CROSS JOIN expired;
$$;

CREATE FUNCTION public.read_assistant_allowances_v1(p_user uuid,p_allow_sandbox boolean)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT private.read_assistant_allowances_v1(p_user,p_allow_sandbox,statement_timestamp())
  WHERE p_user IS NOT NULL;
$$;

CREATE FUNCTION public.reserve_assistant_allowance_v1(p_user uuid,p_feature text,p_operation uuid,p_allow_sandbox boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE at_time timestamptz; snapshot jsonb; charge boolean;
BEGIN
  IF p_user IS NULL OR p_operation IS NULL OR p_feature IS NULL OR p_feature NOT IN ('ai_reply','dictation') THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE='22023';
  END IF;
  INSERT INTO private.assistant_allowance_accounts (user_id,ai_replies,dictations)
    SELECT p_user,d.ai_replies,d.dictations FROM private.assistant_allowance_defaults d WHERE d.singleton
    ON CONFLICT (user_id) DO NOTHING;
  PERFORM 1 FROM private.assistant_allowance_accounts WHERE user_id=p_user FOR UPDATE;
  at_time:=clock_timestamp();

  WITH released AS (
    UPDATE private.assistant_allowance_operations SET state='released'
      WHERE user_id=p_user AND state='reserved' AND expires_at<=at_time
      RETURNING charged,feature
  ), credits AS (
    SELECT count(*) FILTER (WHERE charged AND feature='ai_reply') AS ai_replies,
      count(*) FILTER (WHERE charged AND feature='dictation') AS dictations
    FROM released
  )
  UPDATE private.assistant_allowance_accounts a
  SET ai_replies=a.ai_replies+c.ai_replies,dictations=a.dictations+c.dictations
  FROM credits c WHERE a.user_id=p_user AND (c.ai_replies>0 OR c.dictations>0);

  snapshot:=private.read_assistant_allowances_v1(p_user,p_allow_sandbox,at_time);
  IF EXISTS(SELECT 1 FROM private.assistant_allowance_operations WHERE user_id=p_user AND operation_id=p_operation) THEN
    RETURN snapshot||jsonb_build_object('decision','duplicate');
  END IF;
  charge:=NOT (snapshot->>'premium')::boolean;
  IF charge AND (CASE p_feature WHEN 'ai_reply' THEN snapshot->>'aiRepliesRemaining'
                             ELSE snapshot->>'dictationsRemaining' END)::integer=0 THEN
    RETURN snapshot||jsonb_build_object('decision','exhausted');
  END IF;
  INSERT INTO private.assistant_allowance_operations (user_id,operation_id,feature,charged,state,expires_at)
    VALUES(p_user,p_operation,p_feature,charge,'reserved',at_time+interval '20 minutes');
  IF charge THEN
    UPDATE private.assistant_allowance_accounts
    SET ai_replies=ai_replies-CASE p_feature WHEN 'ai_reply' THEN 1 ELSE 0 END,
        dictations=dictations-CASE p_feature WHEN 'dictation' THEN 1 ELSE 0 END
    WHERE user_id=p_user;
    snapshot:=private.read_assistant_allowances_v1(p_user,p_allow_sandbox,at_time);
  END IF;
  RETURN snapshot||jsonb_build_object('decision','reserved');
END;
$$;

CREATE FUNCTION public.settle_assistant_allowance_v1(p_user uuid,p_feature text,p_operation uuid,p_success boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE was_charged boolean; at_time timestamptz;
BEGIN
  IF p_success IS NULL THEN RETURN false; END IF;
  PERFORM 1 FROM private.assistant_allowance_accounts WHERE user_id=p_user FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  at_time:=clock_timestamp();

  UPDATE private.assistant_allowance_operations
  SET state=CASE WHEN p_success THEN 'succeeded' ELSE 'released' END
  WHERE user_id=p_user AND operation_id=p_operation AND feature=p_feature AND state='reserved' AND expires_at>at_time
  RETURNING charged INTO was_charged;
  IF NOT FOUND THEN RETURN false; END IF;
  IF was_charged AND NOT p_success THEN
    UPDATE private.assistant_allowance_accounts
    SET ai_replies=ai_replies+CASE p_feature WHEN 'ai_reply' THEN 1 ELSE 0 END,
        dictations=dictations+CASE p_feature WHEN 'dictation' THEN 1 ELSE 0 END
    WHERE user_id=p_user;
  END IF;
  RETURN true;
END;
$$;

ALTER TABLE public.admin_operators DROP CONSTRAINT admin_operators_permissions_allowed;
ALTER TABLE public.admin_operators ADD CONSTRAINT admin_operators_permissions_allowed CHECK (
  permissions <@ ARRAY['dictionaries.read','audit.read','publication.manage','dictionary.content.read',
    'users.read','admission.manage','feedback.read','editorial.edit','notifications.manage',
    'testers.manage','owner','entitlements.manage']::text[]
  AND (NOT ('owner'=ANY(permissions)) OR private.admin_owner_permissions_v1() <@ permissions)
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
    'user.group.added','user.group.removed','user.allowance.granted','user.premium.granted'
  ]::text[])
);

CREATE FUNCTION private.can_manage_learning_access_v1(p_operator uuid)
RETURNS boolean LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  PERFORM 1 FROM public.admin_operators
  WHERE user_id=p_operator AND is_active AND permissions && ARRAY['owner','entitlements.manage']::text[]
  FOR SHARE;
  RETURN FOUND;
END;
$$;

CREATE FUNCTION public.admin_assistant_allowances_v1(p_operator uuid,p_user uuid,p_request uuid,p_allow_sandbox boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM 1 FROM public.admin_operators
  WHERE user_id=p_operator AND is_active AND 'users.read'=ANY(permissions) FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','forbidden'); END IF;
  IF p_request IS NULL OR p_user IS NULL THEN RETURN jsonb_build_object('error','invalid_request'); END IF;
  PERFORM 1 FROM auth.users WHERE id=p_user FOR KEY SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
  INSERT INTO public.admin_audit_events(operator_user_id,action,outcome,target_type,target_id,request_id)
  VALUES(p_operator,'user.access.read','success','user_profile',p_user::text,p_request);

  RETURN private.read_assistant_allowances_v1(p_user,p_allow_sandbox,statement_timestamp())
    || jsonb_build_object('groups',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY name,id),'[]'::jsonb)
         FROM public.dictionary_access_groups));
END;
$$;

CREATE FUNCTION public.admin_grant_assistant_allowance_v1(
  p_operator uuid,p_request uuid,p_user uuid,p_group uuid,p_ai_replies integer,p_dictations integer,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE old_grant private.assistant_allowance_grants; credited_count integer; reason_text text:=btrim(p_reason);
BEGIN
  IF NOT private.can_manage_learning_access_v1(p_operator) THEN RETURN jsonb_build_object('error','forbidden'); END IF;
  IF p_request IS NULL OR (p_user IS NULL)=(p_group IS NULL)
    OR p_ai_replies IS NULL OR p_ai_replies NOT BETWEEN 0 AND 10000
    OR p_dictations IS NULL OR p_dictations NOT BETWEEN 0 AND 10000
    OR p_ai_replies+p_dictations=0 OR reason_text IS NULL OR length(reason_text) NOT BETWEEN 1 AND 500 THEN
    RETURN jsonb_build_object('error','invalid_request');
  END IF;

  INSERT INTO private.assistant_allowance_grants(request_id,user_id,group_id,operator_id,reason,ai_replies,dictations)
  VALUES(p_request,p_user,p_group,p_operator,reason_text,p_ai_replies,p_dictations) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN
    SELECT * INTO STRICT old_grant FROM private.assistant_allowance_grants WHERE request_id=p_request;
    IF (old_grant.user_id,old_grant.group_id,old_grant.operator_id,old_grant.reason,old_grant.ai_replies,old_grant.dictations)
      IS DISTINCT FROM (p_user,p_group,p_operator,reason_text,p_ai_replies,p_dictations) THEN
      RETURN jsonb_build_object('error','request_conflict');
    END IF;
    RETURN jsonb_build_object('grantedUsers',old_grant.granted_users,'replayed',true);
  END IF;

  IF p_user IS NOT NULL THEN
    PERFORM 1 FROM auth.users WHERE id=p_user FOR KEY SHARE;
  ELSE
    PERFORM 1 FROM public.dictionary_access_groups WHERE id=p_group FOR KEY SHARE;
  END IF;
  IF NOT FOUND THEN
    DELETE FROM private.assistant_allowance_grants WHERE request_id=p_request;
    RETURN jsonb_build_object('error','not_found');
  END IF;

  INSERT INTO private.assistant_allowance_grant_recipients(request_id,user_id)
  SELECT p_request,u.id FROM auth.users u
  WHERE u.id=p_user OR EXISTS(
    SELECT 1 FROM public.dictionary_access_group_members m WHERE m.group_id=p_group AND m.user_id=u.id
  ) ORDER BY u.id FOR KEY SHARE OF u;

  -- Acquire account locks in a deterministic order for overlapping group grants.
  INSERT INTO private.assistant_allowance_accounts AS a (user_id,ai_replies,dictations)
  SELECT r.user_id,d.ai_replies+p_ai_replies,d.dictations+p_dictations
  FROM private.assistant_allowance_grant_recipients r CROSS JOIN private.assistant_allowance_defaults d
  WHERE r.request_id=p_request AND d.singleton ORDER BY r.user_id
  ON CONFLICT (user_id) DO UPDATE
    SET ai_replies=a.ai_replies+p_ai_replies,dictations=a.dictations+p_dictations;
  GET DIAGNOSTICS credited_count=ROW_COUNT;

  UPDATE private.assistant_allowance_grants SET granted_users=credited_count WHERE request_id=p_request;
  INSERT INTO public.admin_audit_events(operator_user_id,action,outcome,target_type,target_id,request_id)
  VALUES(p_operator,'user.allowance.granted','success',
    CASE WHEN p_user IS NOT NULL THEN 'user_profile' ELSE 'user_access_group' END,
    coalesce(p_user,p_group)::text,p_request);
  RETURN jsonb_build_object('grantedUsers',credited_count,'replayed',false);
END;
$$;

CREATE FUNCTION public.admin_grant_manual_premium_v1(
  p_operator uuid,p_request uuid,p_user uuid,p_valid_until timestamptz,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE old_grant private.manual_premium_grants; reason_text text:=btrim(p_reason);
BEGIN
  IF NOT private.can_manage_learning_access_v1(p_operator) THEN RETURN jsonb_build_object('error','forbidden'); END IF;
  IF p_request IS NULL OR p_user IS NULL OR p_valid_until IS NULL OR NOT isfinite(p_valid_until)
    OR reason_text IS NULL OR length(reason_text) NOT BETWEEN 1 AND 500 THEN
    RETURN jsonb_build_object('error','invalid_request');
  END IF;

  -- Serialize competing replays before validating the original grant's expiry.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text,401));
  SELECT * INTO old_grant FROM private.manual_premium_grants WHERE request_id=p_request;
  IF FOUND THEN
    IF (old_grant.user_id,old_grant.operator_id,old_grant.valid_until,old_grant.reason)
      IS DISTINCT FROM (p_user,p_operator,p_valid_until,reason_text) THEN
      RETURN jsonb_build_object('error','request_conflict');
    END IF;
    RETURN jsonb_build_object('manualUntil',old_grant.valid_until,'replayed',true);
  END IF;
  IF p_valid_until<=statement_timestamp() THEN RETURN jsonb_build_object('error','invalid_request'); END IF;
  PERFORM 1 FROM auth.users WHERE id=p_user FOR KEY SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;

  INSERT INTO private.manual_premium_grants(request_id,user_id,operator_id,valid_until,reason)
  VALUES(p_request,p_user,p_operator,p_valid_until,reason_text);
  INSERT INTO public.admin_audit_events(operator_user_id,action,outcome,target_type,target_id,request_id)
  VALUES(p_operator,'user.premium.granted','success','user_profile',p_user::text,p_request);
  RETURN jsonb_build_object('manualUntil',p_valid_until,'replayed',false);
END;
$$;

REVOKE ALL ON FUNCTION private.manual_premium_until_v1(uuid,timestamptz),
  private.effective_learning_tier_v1(uuid,timestamptz),
  private.paddle_sandbox_access_v1(uuid),
  private.read_assistant_allowances_v1(uuid,boolean,timestamptz),
  private.adjust_personal_meaning_usage_v1(uuid,uuid,integer),
  private.track_personal_meaning_v1(),
  private.track_personal_dictionary_owner_v1(),
  private.can_manage_learning_access_v1(uuid)
  FROM PUBLIC,anon,authenticated,service_role,authenticator,supabase_auth_admin;
REVOKE ALL ON FUNCTION public.read_assistant_allowances_v1(uuid,boolean),
  public.reserve_assistant_allowance_v1(uuid,text,uuid,boolean),
  public.settle_assistant_allowance_v1(uuid,text,uuid,boolean),
  public.admin_assistant_allowances_v1(uuid,uuid,uuid,boolean),
  public.admin_grant_assistant_allowance_v1(uuid,uuid,uuid,uuid,integer,integer,text),
  public.admin_grant_manual_premium_v1(uuid,uuid,uuid,timestamptz,text)
  FROM PUBLIC,anon,authenticated,service_role,authenticator,supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.read_assistant_allowances_v1(uuid,boolean),
  public.reserve_assistant_allowance_v1(uuid,text,uuid,boolean),
  public.settle_assistant_allowance_v1(uuid,text,uuid,boolean),
  public.admin_assistant_allowances_v1(uuid,uuid,uuid,boolean),
  public.admin_grant_assistant_allowance_v1(uuid,uuid,uuid,uuid,integer,integer,text),
  public.admin_grant_manual_premium_v1(uuid,uuid,uuid,timestamptz,text)
  TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
