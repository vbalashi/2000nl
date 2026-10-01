\pset pager off
\pset format unaligned
\pset tuples_only on
\set ON_ERROR_STOP on
begin read only;
set local statement_timeout='8s';
set local lock_timeout='1s';
set local jit=off;
select set_config('lat.qa',(select id::text from auth.users where email=:'qa_email'),true) is not null;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('lat.qa'),'role','authenticated')::text,true) is not null;
select set_config('lat.list',coalesce((select active_list_id::text from user_settings where user_id=current_setting('lat.qa')::uuid),''),true) is not null;
select set_config('lat.list_type',coalesce((select active_list_type from user_settings where user_id=current_setting('lat.qa')::uuid),'curated'),true) is not null;
explain (analyze,buffers,timing off,format json)
WITH args AS (
  SELECT CASE
      WHEN ARRAY['word-to-definition']::text[] IS NULL OR cardinality(ARRAY['word-to-definition']::text[])=0
        THEN ARRAY['word-to-definition']::text[]
      ELSE ARRAY(
        SELECT DISTINCT trim(mode)
        FROM unnest(ARRAY['word-to-definition']::text[]) requested(mode)
        WHERE trim(mode)<>'' ORDER BY 1
      )
    END modes,
    COALESCE('{"timezone":"Europe/Amsterdam"}'::jsonb,'{}') filter_data,
    COALESCE(current_setting('lat.list_type'),'curated') list_type,
    COALESCE(ARRAY[]::uuid[],ARRAY[]::uuid[]) excluded_entries,
    COALESCE(ARRAY[]::text[],ARRAY[]::text[]) excluded_cards
), reference_now AS MATERIALIZED (
  SELECT private.training_reference_now_v1() AS now_at
), filter_values AS (
  SELECT args.*,
    private.training_filter_target_date(filter_data) target_date,
    private.training_schedule_timezone_v1(
      COALESCE(
        NULLIF(trim(filter_data->>'timezone'),''),
        private.training_user_timezone_v1(current_setting('lat.qa')::uuid)
      )
    ) timezone,
    reference_now.now_at,
    bounds.start_at study_day_start,
    bounds.end_at study_day_end,
    CASE WHEN NULLIF(filter_data->>'sourceId','') ~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      THEN (filter_data->>'sourceId')::uuid END source_id,
    NULLIF(trim(filter_data->>'sourceKind'),'') source_kind,
    NULLIF(trim(filter_data->>'externalId'),'') external_id,
    NULLIF(trim(filter_data#>>'{dictionaryScope,mode}'),'') dictionary_mode,
    NULLIF(trim(filter_data#>>'{dictionaryScope,languageCode}'),'') dictionary_language
  FROM args
  CROSS JOIN reference_now
  CROSS JOIN LATERAL private.training_study_day_bounds_v1(
    reference_now.now_at,
    private.training_schedule_timezone_v1(
      COALESCE(
        NULLIF(trim(args.filter_data->>'timezone'),''),
        private.training_user_timezone_v1(current_setting('lat.qa')::uuid)
      )
    )
  ) bounds
), mode_order AS (
  SELECT requested_mode.card_type_id,random() mode_random
  FROM filter_values
  CROSS JOIN unnest(filter_values.modes) requested_mode(card_type_id)
), cohort_context AS (
  SELECT md5(concat_ws('|',
    current_setting('lat.qa')::uuid::text,
    array_to_string(filter_values.modes,','),
    COALESCE(NULLIF(current_setting('lat.list'),'')::uuid::text,''),
    filter_values.list_type,
    'both'::text,
    filter_values.filter_data::text
  )) cohort_seed
  FROM filter_values
), limits AS (
  SELECT COALESCE(settings.daily_new_limit,10)::bigint new_limit,
    COALESCE(settings.daily_review_limit,200)::bigint review_limit
  FROM (SELECT 1) seed
  LEFT JOIN user_settings settings ON settings.user_id=current_setting('lat.qa')::uuid
), daily AS (
  SELECT count(DISTINCT log.word_id) FILTER (WHERE log.review_type='new') new_today,
    count(*) FILTER (WHERE log.review_type='review') review_today
  FROM user_review_log log, filter_values
  WHERE log.user_id=current_setting('lat.qa')::uuid
    AND log.mode=ANY(filter_values.modes)
    AND log.reviewed_at >= filter_values.study_day_start
    AND log.reviewed_at < filter_values.study_day_end
), readable_dictionaries AS MATERIALIZED (
  SELECT dictionary.id,dictionary.language_code
  FROM dictionaries dictionary
  WHERE can_access_dictionary(current_setting('lat.qa')::uuid,dictionary.id,'read')
), selected_dictionaries AS MATERIALIZED (
  SELECT DISTINCT requested.id::uuid AS id
  FROM filter_values
  CROSS JOIN LATERAL jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(filter_values.filter_data#>'{dictionaryScope,dictionaryIds}')='array'
      THEN filter_values.filter_data#>'{dictionaryScope,dictionaryIds}'
      ELSE '[]'::jsonb END
  ) requested(id)
  WHERE requested.id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
), raw_scope AS MATERIALIZED (
  SELECT scope_entry.entry_id AS id
  FROM private.default_training_scope_entries_v1 scope_entry
  CROSS JOIN filter_values
  LEFT JOIN readable_dictionaries readable_dictionary
    ON readable_dictionary.id=scope_entry.dictionary_id
  WHERE NULLIF(current_setting('lat.list'),'')::uuid IS NULL
    AND filter_values.dictionary_mode IS NULL
    AND NOT (filter_values.filter_data ? 'partOfSpeech'
      OR filter_values.filter_data ? 'nounArticles')
    AND NOT (scope_entry.entry_id=ANY(filter_values.excluded_entries))
    AND (scope_entry.dictionary_id IS NULL OR readable_dictionary.id IS NOT NULL)
  UNION ALL
  SELECT scope_entry.entry_id AS id
  FROM private.default_training_scope_entries_v1 scope_entry
  CROSS JOIN filter_values
  LEFT JOIN readable_dictionaries readable_dictionary
    ON readable_dictionary.id=scope_entry.dictionary_id
  JOIN word_entries lexical_entry ON lexical_entry.id=scope_entry.entry_id
  WHERE NULLIF(current_setting('lat.list'),'')::uuid IS NULL
    AND filter_values.dictionary_mode IS NULL
    AND (filter_values.filter_data ? 'partOfSpeech'
      OR filter_values.filter_data ? 'nounArticles')
    AND NOT (scope_entry.entry_id=ANY(filter_values.excluded_entries))
    AND (scope_entry.dictionary_id IS NULL OR readable_dictionary.id IS NOT NULL)
    AND private.training_lexical_candidate_matches_v1(
      lexical_entry.part_of_speech, lexical_entry.gender,
      filter_values.filter_data
    )
  UNION ALL
  SELECT entry.id
  FROM word_entries entry
  CROSS JOIN filter_values
  LEFT JOIN readable_dictionaries readable_dictionary
    ON readable_dictionary.id=entry.dictionary_id
  WHERE NULLIF(current_setting('lat.list'),'')::uuid IS NOT NULL
    AND filter_values.dictionary_mode IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM word_entries pointer_entry
      WHERE pointer_entry.id=entry.id
        AND private.is_pointer_only_dictionary_entry_v1(pointer_entry.raw)
    )
    AND NOT (entry.id=ANY(filter_values.excluded_entries))
    AND (entry.dictionary_id IS NULL OR readable_dictionary.id IS NOT NULL)
    AND ((filter_values.list_type='curated' AND EXISTS (
        SELECT 1 FROM word_list_items item
        WHERE item.list_id=NULLIF(current_setting('lat.list'),'')::uuid AND item.word_id=entry.id
      ))
      OR (filter_values.list_type='user' AND EXISTS (
        SELECT 1 FROM user_word_list_items item
        JOIN user_word_lists list ON list.id=item.list_id
        WHERE item.list_id=NULLIF(current_setting('lat.list'),'')::uuid AND item.word_id=entry.id AND list.user_id=current_setting('lat.qa')::uuid
      )))
    AND CASE
      WHEN filter_values.filter_data ? 'partOfSpeech'
        OR filter_values.filter_data ? 'nounArticles'
      THEN private.training_lexical_candidate_matches_v1(
        entry.part_of_speech, entry.gender, filter_values.filter_data
      )
      ELSE true
    END
  UNION ALL
  SELECT entry.id
  FROM word_entries entry
  CROSS JOIN filter_values
  JOIN readable_dictionaries readable_dictionary
    ON readable_dictionary.id=entry.dictionary_id
   AND readable_dictionary.language_code=filter_values.dictionary_language
  WHERE NULLIF(current_setting('lat.list'),'')::uuid IS NULL
    AND filter_values.dictionary_mode IN ('all','selected')
    AND entry.language_code=filter_values.dictionary_language
    AND NOT (entry.id=ANY(filter_values.excluded_entries))
    AND (filter_values.dictionary_mode='all' OR EXISTS (
      SELECT 1 FROM selected_dictionaries selected
      WHERE selected.id=entry.dictionary_id
    ))
    AND NOT EXISTS (
      SELECT 1 FROM word_entries pointer_entry
      WHERE pointer_entry.id=entry.id
        AND private.is_pointer_only_dictionary_entry_v1(pointer_entry.raw)
    )
    AND CASE
      WHEN filter_values.filter_data ? 'partOfSpeech'
        OR filter_values.filter_data ? 'nounArticles'
      THEN private.training_lexical_candidate_matches_v1(
        entry.part_of_speech, entry.gender, filter_values.filter_data
      )
      ELSE true
    END
), scope AS MATERIALIZED (
    SELECT raw_scope.id FROM raw_scope
    JOIN public.word_entries material_entry ON material_entry.id=raw_scope.id
    CROSS JOIN filter_values material_filter
    WHERE private.training_material_entry_selected_v1(
      material_entry.language_code,material_entry.dictionary_id,material_filter.filter_data)
  ), matched AS (
  SELECT event.entry_id,event.card_type_id,max(event.created_at) latest_event_at
  FROM user_card_action_events event
  LEFT JOIN learning_sources source ON source.id=event.source_id
  CROSS JOIN filter_values
  WHERE event.user_id=current_setting('lat.qa')::uuid
    AND event.card_type_id=ANY(filter_values.modes)
    AND (filter_values.target_date IS NULL OR
      private.training_filter_local_date(event.created_at,filter_values.timezone)=filter_values.target_date)
    AND (filter_values.source_id IS NULL OR event.source_id=filter_values.source_id)
    AND (filter_values.source_kind IS NULL OR source.kind=filter_values.source_kind
      OR source.provider=filter_values.source_kind
      OR (filter_values.source_kind='youtube' AND
        (source.kind IN ('youtube','youtube_video') OR source.provider='youtube')))
    AND (filter_values.external_id IS NULL OR source.external_id=filter_values.external_id)
  GROUP BY event.entry_id,event.card_type_id
), study_day_new_words AS MATERIALIZED (
  SELECT DISTINCT log.word_id
  FROM user_review_log log, filter_values
  WHERE log.user_id=current_setting('lat.qa')::uuid
    AND log.mode=ANY(filter_values.modes)
    AND log.review_type='new'
    AND log.reviewed_at >= filter_values.study_day_start
    AND log.reviewed_at < filter_values.study_day_end
), study_day_new_cards AS MATERIALIZED (
  SELECT DISTINCT log.word_id,log.mode AS card_type_id
  FROM user_review_log log, filter_values
  WHERE log.user_id=current_setting('lat.qa')::uuid
    AND log.mode=ANY(filter_values.modes)
    AND log.review_type='new'
    AND log.reviewed_at >= filter_values.study_day_start
    AND log.reviewed_at < filter_values.study_day_end
), known_cards AS MATERIALIZED (
  SELECT known.entry_id,known.card_type_id
  FROM user_card_known_marks known,filter_values
  WHERE known.user_id=current_setting('lat.qa')::uuid
    AND known.card_type_id=ANY(filter_values.modes)
    AND known.cleared_at IS NULL
), learner_status AS MATERIALIZED (
  SELECT status.*
  FROM user_card_status status,filter_values
  WHERE status.user_id=current_setting('lat.qa')::uuid
    AND status.card_type_id=ANY(filter_values.modes)
), unrenderable_direct_entries AS MATERIALIZED (
  SELECT entry_id FROM private.unrenderable_ordinary_direct_entries_v1
), active_source_bindings AS MATERIALIZED (
  SELECT binding.dictionary_id, binding.identity_scheme_version,
    binding.source_group_key, binding.sense_ordinal, binding.word_entry_id
  FROM private.source_entry_bindings binding
  WHERE binding.binding_state = 'active'
), source_bound_entries AS MATERIALIZED (
  SELECT binding.word_entry_id AS entry_id
  FROM active_source_bindings binding
), scoped_source_groups AS NOT MATERIALIZED (
  SELECT DISTINCT binding.dictionary_id, binding.identity_scheme_version,
    binding.source_group_key
  FROM active_source_bindings binding
  JOIN scope ON scope.id = binding.word_entry_id
), active_source_definitions AS MATERIALIZED (
  SELECT definition.entry_id
  FROM private.platform_v2_content_nodes definition
  WHERE definition.binding_state = 'active'
    AND definition.parent_content_node_id IS NULL
    AND definition.kind = 'definition'
), ordinary_source_introductions AS MATERIALIZED (
  SELECT binding.word_entry_id AS entry_id,
    lag(binding.word_entry_id) OVER (
      PARTITION BY binding.dictionary_id, binding.identity_scheme_version,
        binding.source_group_key
      ORDER BY binding.sense_ordinal, binding.word_entry_id
    ) AS predecessor_entry_id
  FROM active_source_bindings binding
  JOIN scoped_source_groups source_group
    USING (dictionary_id, identity_scheme_version, source_group_key)
  JOIN active_source_definitions definition
    ON definition.entry_id = binding.word_entry_id
  -- Active bindings and exception entry IDs are non-null by schema. Hashing
  -- this small exception set avoids one index probe per scoped meaning.
  WHERE binding.word_entry_id NOT IN (
    SELECT unrenderable.entry_id FROM unrenderable_direct_entries unrenderable
  )
), cards AS (
  SELECT scope.id entry_id,mode_order.card_type_id,status.fsrs_enabled,
    status.fsrs_last_interval,status.next_review_at,status.hidden,status.frozen_until,
    status.entry_id IS NOT NULL has_status,matched.entry_id IS NOT NULL matches_filter,
    matched.latest_event_at,mode_order.mode_random,
    filter_values.now_at reference_now,
    study_day_new_words.word_id IS NOT NULL new_seen_today,
    study_day_new_cards.word_id IS NOT NULL new_card_seen_today,
    CASE
      WHEN status.fsrs_enabled=true AND COALESCE(status.fsrs_last_interval,0)<1
        AND status.next_review_at<=filter_values.now_at THEN 'learning'
      WHEN status.fsrs_enabled=true AND status.fsrs_last_interval>=1
        AND status.next_review_at<=filter_values.now_at THEN 'review'
      WHEN status.entry_id IS NULL OR COALESCE(status.fsrs_enabled,false)=false THEN 'new'
      ELSE 'practice'
    END intrinsic_source
  FROM scope
  CROSS JOIN filter_values CROSS JOIN mode_order
  LEFT JOIN learner_status status ON status.entry_id=scope.id
    AND status.card_type_id=mode_order.card_type_id
  LEFT JOIN matched ON matched.entry_id=scope.id AND matched.card_type_id=mode_order.card_type_id
  LEFT JOIN study_day_new_words ON study_day_new_words.word_id=scope.id
  LEFT JOIN study_day_new_cards ON study_day_new_cards.word_id=scope.id
    AND study_day_new_cards.card_type_id=mode_order.card_type_id
  LEFT JOIN known_cards ON known_cards.entry_id=scope.id
    AND known_cards.card_type_id=mode_order.card_type_id
  WHERE NOT ((scope.id::text||':'||mode_order.card_type_id)=ANY(filter_values.excluded_cards))
    AND known_cards.entry_id IS NULL
    AND (mode_order.card_type_id NOT IN ('word-to-definition','definition-to-word') OR NOT EXISTS (
      SELECT 1 FROM private.training_headword_exclusions exclusion
      WHERE exclusion.user_id=current_setting('lat.qa')::uuid AND exclusion.restored_at IS NULL
        AND exclusion.headword_group_id=private.training_headword_group_v1(scope.id)))
    AND NOT EXISTS (SELECT 1 FROM private.training_pair_exclusions exclusion
      WHERE exclusion.user_id=current_setting('lat.qa')::uuid AND exclusion.restored_at IS NULL
        AND exclusion.pair_key=private.training_pair_key_v1(
          'meaning', scope.id, NULL, NULL, mode_order.card_type_id))
), eligible AS (
  SELECT cards.*
  FROM cards
  LEFT JOIN unrenderable_direct_entries unrenderable
    ON unrenderable.entry_id = cards.entry_id
  LEFT JOIN source_bound_entries source_bound
    ON source_bound.entry_id = cards.entry_id
  LEFT JOIN ordinary_source_introductions introduction
    ON introduction.entry_id = cards.entry_id
  LEFT JOIN private.ordinary_meaning_introduction_unlocks_v1 predecessor_unlock
    ON predecessor_unlock.user_id = current_setting('lat.qa')::uuid
   AND predecessor_unlock.entry_id = introduction.predecessor_entry_id
  WHERE COALESCE(hidden,false)=false AND (frozen_until IS NULL OR frozen_until<=reference_now)
    AND CASE
      WHEN (SELECT filter_data->>'presentationMode' FROM filter_values)
        = 'word-in-context'
      THEN private.training_word_context_candidate_v1(
        current_setting('lat.qa')::uuid, cards.entry_id, cards.card_type_id)
      ELSE true
    END
    AND (
      card_type_id <> 'word-to-definition'
      OR unrenderable.entry_id IS NULL
    )
    AND (
      intrinsic_source <> 'new'
      OR (
        card_type_id = 'definition-to-word'
        AND COALESCE((SELECT filter_data->>'presentationMode' FROM filter_values), '')
          = 'word-in-context'
      )
      OR (
        card_type_id = 'word-to-definition'
        AND (
          source_bound.entry_id IS NULL
          OR (
            introduction.entry_id IS NOT NULL
            AND (
              introduction.predecessor_entry_id IS NULL
              OR predecessor_unlock.available_at <= reference_now
            )
          )
        )
      )
    )
    AND CASE WHEN false THEN
      matches_filter AND has_status AND
      ('both'::text='both' OR ('both'::text='review' AND fsrs_enabled=true)
        OR ('both'::text='new' AND COALESCE(fsrs_enabled,false)=false))
    ELSE NOT has_status OR fsrs_enabled=true END
), new_word_ranks AS (
  SELECT unseen.entry_id,
    row_number() OVER (
      ORDER BY md5(cohort_context.cohort_seed||':'||unseen.entry_id::text)
    ) new_word_ordinal,
    count(*) OVER () new_word_count
  FROM (
    SELECT DISTINCT entry_id FROM eligible
    WHERE intrinsic_source='new' AND NOT new_seen_today
  ) unseen CROSS JOIN cohort_context
), ranked AS (
  SELECT eligible.*,
    row_number() OVER (
      PARTITION BY eligible.intrinsic_source
      ORDER BY CASE WHEN eligible.intrinsic_source IN ('review','learning') THEN eligible.next_review_at END,
        md5(eligible.entry_id::text||':'||eligible.card_type_id)
    ) source_ordinal,
    new_word_ranks.new_word_ordinal,
    COALESCE((SELECT max(new_word_count) FROM new_word_ranks),0) new_word_count,
    count(*) FILTER (WHERE intrinsic_source='review') OVER () review_count
  FROM eligible
  LEFT JOIN new_word_ranks ON new_word_ranks.entry_id=eligible.entry_id
), classified AS (
  SELECT ranked.*,
    GREATEST(0,limits.new_limit-COALESCE(daily.new_today,0)) new_remaining,
    GREATEST(0,limits.review_limit-COALESCE(daily.review_today,0)) review_remaining
  FROM ranked CROSS JOIN limits CROSS JOIN daily
), scheduled AS (
  SELECT classified.*,
    CASE
      WHEN false AND (
        'both'::text = 'both'
        OR ('both'::text = 'new' AND intrinsic_source = 'new')
        OR ('both'::text = 'review' AND intrinsic_source IN ('review', 'learning'))
      ) THEN intrinsic_source
      WHEN false THEN NULL
      WHEN intrinsic_source='learning' AND 'both'::text='both' THEN 'learning'
      WHEN intrinsic_source='review' AND 'both'::text<>'new' THEN 'review'
      WHEN intrinsic_source='new' AND 'both'::text<>'review' THEN 'new'
      ELSE 'practice'
    END queue_source
  FROM classified
), diagnostics AS (
  SELECT
    CASE WHEN false THEN
      count(*) FILTER (
        WHERE matches_filter AND has_status AND COALESCE(hidden,false)=false
          AND (frozen_until IS NULL OR frozen_until<=reference_now)
          AND COALESCE(fsrs_enabled,false)=false
      )
    ELSE (
      SELECT count(*)
      FROM scope
      LEFT JOIN (SELECT DISTINCT entry_id FROM learner_status) pool_status
        ON pool_status.entry_id=scope.id
      WHERE pool_status.entry_id IS NULL
    ) END AS new_pool_size,
    count(*) FILTER (
      WHERE (NOT false OR matches_filter) AND has_status
        AND COALESCE(hidden,false)=false
        AND (frozen_until IS NULL OR frozen_until<=reference_now)
        AND COALESCE(fsrs_enabled,false)=true
        AND COALESCE(fsrs_last_interval,0)<1 AND next_review_at<=reference_now
    ) AS learning_due_count,
    count(*) FILTER (
      WHERE (NOT false OR matches_filter) AND has_status
        AND COALESCE(hidden,false)=false
        AND (frozen_until IS NULL OR frozen_until<=reference_now)
        AND COALESCE(fsrs_enabled,false)=true
        AND fsrs_last_interval>=1 AND next_review_at<=reference_now
    ) AS review_pool_size
  FROM cards
), ordered AS (
  SELECT scheduled.*,
    CASE
      WHEN false AND 'auto'::text='review' AND queue_source IN ('review','learning') THEN 0
      WHEN false AND 'auto'::text='new' AND queue_source='new' THEN 0
      WHEN NOT false AND 'auto'::text='new' AND queue_source='new' THEN 0
      WHEN NOT false AND 'auto'::text='new' AND queue_source='learning' THEN 1
      WHEN NOT false AND 'auto'::text='new' AND queue_source='review' THEN 2
      WHEN queue_source='review' THEN 1
      WHEN queue_source='learning' THEN 2
      WHEN queue_source='new' THEN 3
      ELSE 4
    END source_rank
  FROM scheduled WHERE queue_source IS NOT NULL
)
SELECT entry_id,card_type_id,queue_source,
  row_number() OVER (ORDER BY source_rank,
    CASE WHEN false THEN latest_event_at END DESC NULLS LAST,
    CASE WHEN queue_source IN ('review','learning') THEN next_review_at END,
    CASE WHEN queue_source IN ('new','practice') THEN mode_random END,
    CASE WHEN queue_source IN ('new','practice') THEN random() END) selection_order,
  COALESCE(daily.new_today,0),limits.new_limit,COALESCE(diagnostics.new_pool_size,0),
  COALESCE(diagnostics.learning_due_count,0),LEAST(COALESCE(diagnostics.review_pool_size,0),10)
FROM ordered CROSS JOIN daily CROSS JOIN limits CROSS JOIN diagnostics;
rollback;
