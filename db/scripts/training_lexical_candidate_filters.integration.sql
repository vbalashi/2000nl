-- Run after bootstrap on a disposable database. Everything rolls back.
BEGIN;

INSERT INTO auth.users (id, email)
VALUES ('40800000-0000-0000-0000-000000000001', 'issue408-lexical-test@2000nl.test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.word_entries (
  id, language_code, headword, meaning_id, part_of_speech, gender,
  is_nt2_2000, raw
) VALUES
  ('40810000-0000-0000-0000-000000000001', 'nl', 'lopen-issue408', 1, 'ww', NULL, false, '{"meanings":[{"definition":"to walk"}]}'::jsonb),
  ('40810000-0000-0000-0000-000000000002', 'nl', 'tafel-issue408', 1, 'zn.', 'de', false, '{"meanings":[{"definition":"table"}]}'::jsonb),
  ('40810000-0000-0000-0000-000000000003', 'nl', 'huis-issue408', 1, 'zn', 'het', false, '{"meanings":[{"definition":"house"}]}'::jsonb),
  ('40810000-0000-0000-0000-000000000004', 'nl', 'onbekend-issue408', 1, NULL, 'de', false, '{"meanings":[{"definition":"unknown POS"}]}'::jsonb),
  ('40810000-0000-0000-0000-000000000005', 'nl', 'klein-issue408', 1, 'bn', NULL, false, '{"meanings":[{"definition":"small"}]}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_word_lists (id, user_id, language_code, name)
VALUES (
  '40820000-0000-0000-0000-000000000001',
  '40800000-0000-0000-0000-000000000001',
  'nl',
  'Issue 408 lexical candidate test'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_word_list_items (list_id, word_id)
SELECT '40820000-0000-0000-0000-000000000001', entry_id
FROM unnest(ARRAY[
  '40810000-0000-0000-0000-000000000001'::uuid,
  '40810000-0000-0000-0000-000000000002'::uuid,
  '40810000-0000-0000-0000-000000000003'::uuid,
  '40810000-0000-0000-0000-000000000004'::uuid,
  '40810000-0000-0000-0000-000000000005'::uuid
]) entry_id
ON CONFLICT DO NOTHING;

-- Mark every target as an already introduced due review. New direct-recall
-- candidates intentionally require the separate first-introduction contract.
INSERT INTO public.user_card_status (
  user_id, entry_id, card_type_id, fsrs_enabled, fsrs_last_interval,
  next_review_at, hidden
)
SELECT '40800000-0000-0000-0000-000000000001', entry_id,
  'definition-to-word', true, 2, now() - interval '1 day', false
FROM unnest(ARRAY[
  '40810000-0000-0000-0000-000000000001'::uuid,
  '40810000-0000-0000-0000-000000000002'::uuid,
  '40810000-0000-0000-0000-000000000003'::uuid,
  '40810000-0000-0000-0000-000000000004'::uuid,
  '40810000-0000-0000-0000-000000000005'::uuid
]) entry_id;

SELECT set_config('request.jwt.claim.sub', '40800000-0000-0000-0000-000000000001', true);

DO $$
DECLARE
  v_user uuid := '40800000-0000-0000-0000-000000000001';
  v_list uuid := '40820000-0000-0000-0000-000000000001';
  v_plan jsonb;
  v_session jsonb;
  v_members uuid[];
BEGIN
  v_plan := public.get_training_session_plan(
    v_user, ARRAY['definition-to-word'], v_list, 'user', 'review',
    '{"partOfSpeech":["ww"]}'::jsonb, '10', 2
  );
  IF (v_plan->>'plannedTotal')::integer <> 1 THEN
    RAISE EXCEPTION 'POS filter should plan only one verb; got %', v_plan;
  END IF;

  v_plan := public.get_training_session_plan(
    v_user, ARRAY['definition-to-word'], v_list, 'user', 'review',
    '{"nounArticles":["de"]}'::jsonb, '10', 2
  );
  IF (v_plan->>'plannedTotal')::integer <> 1 THEN
    RAISE EXCEPTION 'de filter should include the de noun and exclude missing POS; got %', v_plan;
  END IF;

  v_plan := public.get_training_session_plan(
    v_user, ARRAY['definition-to-word'], v_list, 'user', 'review',
    '{"nounArticles":["het"]}'::jsonb, '10', 2
  );
  IF (v_plan->>'plannedTotal')::integer <> 1 THEN
    RAISE EXCEPTION 'het filter should include only the het noun; got %', v_plan;
  END IF;

  v_plan := public.get_training_session_plan(
    v_user, ARRAY['definition-to-word'], v_list, 'user', 'review',
    '{"partOfSpeech":["zn","ww"],"nounArticles":["de"]}'::jsonb, '10', 2
  );
  IF (v_plan->>'plannedTotal')::integer <> 2 THEN
    RAISE EXCEPTION 'noun article should narrow nouns while retaining selected verbs; got %', v_plan;
  END IF;

  v_plan := public.get_training_session_plan(
    v_user, ARRAY['definition-to-word'], v_list, 'user', 'review',
    '{"partOfSpeech":["unsupported"]}'::jsonb, '10', 2
  );
  IF (v_plan->>'plannedTotal')::integer <> 0 THEN
    RAISE EXCEPTION 'unsupported POS must fail closed; got %', v_plan;
  END IF;

  v_plan := public.get_training_session_plan(
    v_user, ARRAY['definition-to-word'], v_list, 'user', 'review', '{}'::jsonb, '10', 2
  );
  IF (v_plan->>'plannedTotal')::integer <> 5 THEN
    RAISE EXCEPTION 'no lexical filter must retain entries with missing POS; got %', v_plan;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.get_next_filtered_card(
      v_user, ARRAY['definition-to-word'], ARRAY[]::uuid[], v_list, 'user',
      'review', 'auto', ARRAY[]::text[],
      '{"partOfSpeech":["ww"]}'::jsonb, false
    ) candidate
    WHERE candidate->>'id' = '40810000-0000-0000-0000-000000000001'
  ) THEN
    RAISE EXCEPTION 'standalone lexical filtering must not require activity history';
  END IF;

  v_session := public.start_training_session(
    v_user, ARRAY['definition-to-word'], v_list, 'user', 'review',
    '{"partOfSpeech":["zn","ww"],"nounArticles":["de"]}'::jsonb,
    '10', '40830000-0000-0000-0000-000000000001', 2
  );
  SELECT array_agg(member.entry_id ORDER BY member.entry_id)
  INTO v_members
  FROM public.training_session_members member
  WHERE member.session_id = (v_session->>'sessionId')::uuid;
  IF v_members IS DISTINCT FROM ARRAY[
    '40810000-0000-0000-0000-000000000001'::uuid,
    '40810000-0000-0000-0000-000000000002'::uuid
  ] THEN
    RAISE EXCEPTION 'session membership must latch the filtered candidates; got %', v_members;
  END IF;
END;
$$;

ROLLBACK;
