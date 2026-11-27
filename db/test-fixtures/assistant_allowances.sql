\set ON_ERROR_STOP on
BEGIN;
SET LOCAL client_min_messages=warning;

DO $$
DECLARE
  free_user uuid:=gen_random_uuid();
  other_free uuid:=gen_random_uuid();
  operator_user uuid:=gen_random_uuid();
  observer_user uuid:=gen_random_uuid();
  test_group uuid:=gen_random_uuid();
  first_operation uuid:=gen_random_uuid();
  second_operation uuid:=gen_random_uuid();
  dictation_operation uuid:=gen_random_uuid();
  promotion uuid:=gen_random_uuid();
  manual_grant uuid:=gen_random_uuid();
  expired_grant uuid:=gen_random_uuid();
  old_premium_expiry timestamptz:=statement_timestamp()+interval '15 days';
  snapshot jsonb;
  nl_dictionary uuid;
  en_dictionary uuid;
  archived_meaning uuid;
  premium_dictionary uuid;
  restricted_dictionary uuid;
  i integer;
BEGIN
  INSERT INTO auth.users(id,email) SELECT u,u::text||'@allowance-test.invalid'
    FROM unnest(ARRAY[free_user,other_free,operator_user,observer_user]) ids(u);
  INSERT INTO public.admin_operators(email,user_id,is_active,permissions) VALUES
    (operator_user::text||'@allowance-test.invalid',operator_user,true,ARRAY['users.read','entitlements.manage']),
    (observer_user::text||'@allowance-test.invalid',observer_user,true,ARRAY['users.read']);
  INSERT INTO public.languages(code,name) VALUES('en','English') ON CONFLICT DO NOTHING;
  INSERT INTO public.dictionary_access_groups(id,key,name) VALUES(test_group,'allowance-'||test_group::text,'Allowance test');
  INSERT INTO public.dictionary_access_group_members(group_id,user_id) VALUES(test_group,free_user),(test_group,other_free);

  snapshot:=public.read_assistant_allowances_v1(free_user,false);
  IF snapshot IS DISTINCT FROM '{"premium":false,"manualUntil":null,"aiRepliesRemaining":2,"dictationsRemaining":10,"personalMeaningsRemaining":100}'::jsonb THEN
    RAISE EXCEPTION 'Unexpected initial snapshot: %',snapshot;
  END IF;
  snapshot:=public.reserve_assistant_allowance_v1(free_user,'ai_reply',first_operation,false);
  IF snapshot->>'decision'<>'reserved' OR (snapshot->>'aiRepliesRemaining')::integer<>1 THEN
    RAISE EXCEPTION 'AI reservation did not charge one attempt: %',snapshot;
  END IF;
  snapshot:=public.reserve_assistant_allowance_v1(free_user,'ai_reply',first_operation,false);
  IF snapshot->>'decision'<>'duplicate' OR (snapshot->>'aiRepliesRemaining')::integer<>1 THEN
    RAISE EXCEPTION 'Retry did not preserve the balance: %',snapshot;
  END IF;
  IF NOT public.settle_assistant_allowance_v1(free_user,'ai_reply',first_operation,true)
    OR public.settle_assistant_allowance_v1(free_user,'ai_reply',first_operation,false) THEN
    RAISE EXCEPTION 'Repeated settlement changed a completed reservation';
  END IF;
  snapshot:=public.reserve_assistant_allowance_v1(free_user,'ai_reply',second_operation,false);
  IF snapshot->>'decision'<>'reserved' OR (snapshot->>'aiRepliesRemaining')::integer<>0
    OR public.reserve_assistant_allowance_v1(free_user,'ai_reply',gen_random_uuid(),false)->>'decision'<>'exhausted' THEN
    RAISE EXCEPTION 'AI exhaustion was not enforced: %',snapshot;
  END IF;
  IF NOT public.settle_assistant_allowance_v1(free_user,'ai_reply',second_operation,false) THEN
    RAISE EXCEPTION 'Failed request could not be released';
  END IF;
  IF (public.read_assistant_allowances_v1(free_user,false)->>'aiRepliesRemaining')::integer<>1 THEN
    RAISE EXCEPTION 'Failed request did not release one reply';
  END IF;
  snapshot:=public.reserve_assistant_allowance_v1(free_user,'dictation',dictation_operation,false);
  IF snapshot->>'decision'<>'reserved' OR (snapshot->>'dictationsRemaining')::integer<>9
    OR (snapshot->>'aiRepliesRemaining')::integer<>1 THEN
    RAISE EXCEPTION 'Dictation affected the reply balance: %',snapshot;
  END IF;
  UPDATE private.assistant_allowance_operations SET expires_at=clock_timestamp()-interval '1 second'
    WHERE user_id=free_user AND operation_id=dictation_operation;
  IF public.settle_assistant_allowance_v1(free_user,'dictation',dictation_operation,true)
    OR (public.read_assistant_allowances_v1(free_user,false)->>'dictationsRemaining')::integer<>10
    OR public.reserve_assistant_allowance_v1(free_user,'dictation',dictation_operation,false)->>'decision'<>'duplicate' THEN
    RAISE EXCEPTION 'Expired reservation was not recovered exactly once';
  END IF;

  IF public.admin_grant_assistant_allowance_v1(observer_user,gen_random_uuid(),free_user,NULL,5,0,'Denied')->>'error'<>'forbidden' THEN
    RAISE EXCEPTION 'Read-only operator could grant credits';
  END IF;
  snapshot:=public.admin_grant_assistant_allowance_v1(operator_user,promotion,NULL,test_group,3,1,'Group trial');
  IF snapshot IS DISTINCT FROM '{"grantedUsers":2,"replayed":false}'::jsonb THEN
    RAISE EXCEPTION 'Group grant did not credit snapshot: %',snapshot;
  END IF;
  DELETE FROM public.dictionary_access_group_members WHERE group_id=test_group AND user_id=other_free;
  snapshot:=public.admin_grant_assistant_allowance_v1(operator_user,promotion,NULL,test_group,3,1,'Group trial');
  IF snapshot IS DISTINCT FROM '{"grantedUsers":2,"replayed":true}'::jsonb
    OR public.admin_grant_assistant_allowance_v1(operator_user,promotion,NULL,test_group,4,1,'Group trial')->>'error'<>'request_conflict'
    OR (public.read_assistant_allowances_v1(other_free,false)->>'aiRepliesRemaining')::integer<>5
    OR (SELECT count(*) FROM public.admin_audit_events WHERE request_id=promotion)<>1 THEN
    RAISE EXCEPTION 'Group replay changed the snapshot, balance or audit history: %',snapshot;
  END IF;

  -- Persist 100 live meanings, including a second language, through the real write seam.
  PERFORM set_config('request.jwt.claim.sub',free_user::text,true);
  nl_dictionary:=public.ensure_user_dictionary(free_user,'nl','Allowance test NL');
  en_dictionary:=public.ensure_user_dictionary(free_user,'en','Allowance test EN');
  FOR i IN 1..100 LOOP
    INSERT INTO public.word_entries(dictionary_id,language_code,headword,raw)
    VALUES(CASE WHEN i<=50 THEN nl_dictionary ELSE en_dictionary END,
           CASE WHEN i<=50 THEN 'nl' ELSE 'en' END,'allowance-word-'||i,'{}'::jsonb)
    RETURNING id INTO archived_meaning;
  END LOOP;
  IF (public.read_assistant_allowances_v1(free_user,false)->>'personalMeaningsRemaining')::integer<>0 THEN
    RAISE EXCEPTION 'Personal meaning count did not aggregate across languages';
  END IF;
  UPDATE public.word_entries SET raw='{"notes":"existing entry edit"}'::jsonb WHERE id=archived_meaning;
  BEGIN
    PERFORM public.save_personal_article_v1('nl','one too many',NULL,'[{"definition":"extra meaning"}]');
    RAISE EXCEPTION 'Expected a limit on the 101st active meaning';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM<>'personal_meaning_allowance_exhausted' THEN RAISE; END IF;
  END;
  PERFORM public.delete_user_dictionary_entry(free_user,archived_meaning);
  IF (public.read_assistant_allowances_v1(free_user,false)->>'personalMeaningsRemaining')::integer<>1 THEN
    RAISE EXCEPTION 'Deleting a meaning did not free a slot';
  END IF;
  PERFORM public.save_personal_article_v1('nl','replacement word',NULL,'[{"definition":"replacement meaning"}]');

  INSERT INTO public.dictionaries(language_code,slug,name,kind,visibility,minimum_subscription_tier,publication_state)
  VALUES('nl','quota-general-'||free_user::text,'Premium allowance test','curated','system','premium','general')
  RETURNING id INTO premium_dictionary;
  INSERT INTO public.dictionaries(language_code,slug,name,kind,visibility,minimum_subscription_tier,publication_state)
  VALUES('nl','quota-restricted-'||free_user::text,'Restricted allowance test','curated','system','premium','restricted')
  RETURNING id INTO restricted_dictionary;
  INSERT INTO public.dictionary_entitlements(dictionary_id,subject_type,subject_key,permission)
  VALUES(restricted_dictionary,'tier','premium','read');
  IF public.can_access_dictionary(free_user,premium_dictionary,'read') THEN
    RAISE EXCEPTION 'Free account could train with Premium material';
  END IF;

  snapshot:=public.admin_grant_manual_premium_v1(operator_user,manual_grant,free_user,old_premium_expiry,'Timed test');
  IF (snapshot->>'manualUntil')::timestamptz<>old_premium_expiry
    OR public.get_user_tier(free_user)<>'premium'
    OR NOT public.can_access_dictionary(free_user,premium_dictionary,'read')
    OR public.can_access_dictionary(free_user,restricted_dictionary,'read')
    OR public.read_assistant_allowances_v1(free_user,false)->>'premium'<>'true' THEN
    RAISE EXCEPTION 'Active manual grant was not resolved everywhere: %',snapshot;
  END IF;
  PERFORM public.save_personal_article_v1('en','premium extra',NULL,'[{"definition":"older premium entry"}]');
  snapshot:=public.reserve_assistant_allowance_v1(free_user,'ai_reply',gen_random_uuid(),false);
  IF snapshot->>'premium'<>'true' OR (snapshot->>'aiRepliesRemaining')::integer<>4 THEN
    RAISE EXCEPTION 'Premium reservation touched Free balance: %',snapshot;
  END IF;
  UPDATE private.manual_premium_grants
    SET granted_at=statement_timestamp()-interval '2 days',valid_until=statement_timestamp()-interval '1 day'
    WHERE request_id=manual_grant;
  IF public.get_user_tier(free_user)<>'free'
    OR public.can_access_dictionary(free_user,premium_dictionary,'read')
    OR public.read_assistant_allowances_v1(free_user,false)->>'manualUntil' IS NOT NULL
    OR (SELECT meaning_count FROM private.personal_meaning_usage WHERE user_id=free_user)<>101 THEN
    RAISE EXCEPTION 'Manual expiry lost own entries or left entitlement active';
  END IF;
  BEGIN
    PERFORM public.save_personal_article_v1('en','after expiry',NULL,'[{"definition":"no new slot"}]');
    RAISE EXCEPTION 'Expected a limit after Premium expired';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM<>'personal_meaning_allowance_exhausted' THEN RAISE; END IF;
  END;
  INSERT INTO private.manual_premium_grants(request_id,user_id,operator_id,granted_at,valid_until,reason)
  VALUES(expired_grant,free_user,operator_user,statement_timestamp()-interval '2 days',statement_timestamp()-interval '1 day','Expired grant');
  snapshot:=public.admin_grant_manual_premium_v1(
    operator_user,expired_grant,free_user,statement_timestamp()-interval '1 day','Expired grant');
  IF snapshot->>'replayed'<>'true' OR (snapshot->>'manualUntil')::timestamptz<>statement_timestamp()-interval '1 day' THEN
    RAISE EXCEPTION 'Expired grant replay lost its original expiry: %',snapshot;
  END IF;

  PERFORM public.register_paddle_sandbox_attempt('txn_'||repeat('a',26),free_user,'pri_'||repeat('b',26),'month');
  PERFORM public.record_paddle_sandbox_event(jsonb_build_object(
    'eventId','evt_'||repeat('c',26),'kind','payment','transactionId','txn_'||repeat('a',26),
    'subscriptionId','sub_'||repeat('d',26),'priceId','pri_'||repeat('b',26),
    'occurredAt',statement_timestamp(),'validFrom',statement_timestamp()-interval '1 hour',
    'validUntil',statement_timestamp()+interval '1 month','amount',600,'currency','EUR'));
  IF public.read_assistant_allowances_v1(free_user,false)->>'premium'<>'false'
    OR public.read_assistant_allowances_v1(free_user,true)->>'premium'<>'true'
    OR public.read_paddle_sandbox_access()->>'active'<>'true' THEN
    RAISE EXCEPTION 'Signed Sandbox payment is not independently gated';
  END IF;
  BEGIN
    PERFORM public.save_personal_article_v1('en','sandbox disabled',NULL,'[{"definition":"no new slot"}]');
    RAISE EXCEPTION 'Sandbox payment bypassed the default personal capacity flag';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM<>'personal_meaning_allowance_exhausted' THEN RAISE; END IF;
  END;
  UPDATE private.assistant_allowance_defaults SET sandbox_premium_for_meanings=true WHERE singleton;
  PERFORM public.save_personal_article_v1('en','sandbox enabled',NULL,'[{"definition":"sandbox premium slot"}]');
END;
$$;

ROLLBACK;
