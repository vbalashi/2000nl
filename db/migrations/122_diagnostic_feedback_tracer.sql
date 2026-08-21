-- First durable Diagnostic Report v1 tracer. The service boundary validates the
-- closed transport schema; this RPC independently enforces identity, access,
-- retention, and exactly-once persistence.

BEGIN;

CREATE TABLE IF NOT EXISTS public.feedback_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    reporter_pseudonym text NOT NULL CHECK (reporter_pseudonym ~ '^usr_[0-9a-f]{24}$'),
    report_id uuid NOT NULL,
    source_client text NOT NULL,
    app_build_version text NOT NULL,
    kind text NOT NULL CHECK (kind IN (
        'content-quality', 'translation-quality', 'rendering', 'loading',
        'training-action', 'other'
    )),
    problem_type text NOT NULL,
    target_kind text NOT NULL CHECK (target_kind IN (
        'entry', 'sense-card', 'content-node', 'translation-artifact',
        'training-action', 'app-operation'
    )),
    target jsonb NOT NULL,
    source_context jsonb,
    comment_present boolean NOT NULL,
    sanitized_summary text,
    status text NOT NULL DEFAULT 'new' CHECK (status IN (
        'new', 'triaged', 'linked-to-github', 'fixed', 'ignored'
    )),
    resolution text,
    duplicate_of_id uuid REFERENCES public.feedback_items(id) ON DELETE SET NULL,
    github_url text,
    commit_state text CHECK (commit_state IS NULL OR commit_state IN ('committed', 'not-found')),
    safe_error_codes text[] NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (reporter_user_id, report_id),
    CHECK (sanitized_summary IS NULL OR (char_length(sanitized_summary) <= 1000 AND octet_length(sanitized_summary) <= 4096))
);

CREATE TABLE IF NOT EXISTS public.diagnostic_report_receipts (
    reporter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    report_id uuid NOT NULL,
    payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
    feedback_item_id uuid NOT NULL UNIQUE REFERENCES public.feedback_items(id) ON DELETE RESTRICT,
    accepted_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (reporter_user_id, report_id)
);

CREATE TABLE IF NOT EXISTS public.diagnostic_envelopes (
    feedback_item_id uuid PRIMARY KEY REFERENCES public.feedback_items(id) ON DELETE CASCADE,
    reporter_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    report_id uuid NOT NULL,
    payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
    canonical_payload text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
    UNIQUE (reporter_user_id, report_id),
    CHECK (expires_at > created_at),
    CHECK (octet_length(canonical_payload) <= 65536),
    CHECK (canonical_payload::jsonb->>'schemaVersion' = 'diagnostic-report-v1')
);

CREATE INDEX IF NOT EXISTS feedback_items_review_queue_idx
    ON public.feedback_items(status, created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_items_kind_target_idx
    ON public.feedback_items(kind, target_kind, created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_items_source_build_idx
    ON public.feedback_items(source_client, app_build_version, created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_items_safe_codes_idx
    ON public.feedback_items USING gin(safe_error_codes);
CREATE INDEX IF NOT EXISTS diagnostic_envelopes_expiry_idx
    ON public.diagnostic_envelopes(expires_at);

ALTER TABLE public.feedback_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagnostic_envelopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagnostic_report_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.feedback_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.diagnostic_envelopes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.diagnostic_report_receipts FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.feedback_items TO service_role;
GRANT ALL ON TABLE public.diagnostic_envelopes TO service_role;
GRANT ALL ON TABLE public.diagnostic_report_receipts TO service_role;

CREATE OR REPLACE FUNCTION private.jsonb_has_exact_keys(p_value jsonb, p_keys text[])
RETURNS boolean LANGUAGE sql IMMUTABLE
SET search_path = public, private, pg_temp
AS $$
  SELECT jsonb_typeof(p_value) = 'object'
     AND p_value ?& p_keys
     AND (SELECT count(*) FROM jsonb_object_keys(p_value)) = cardinality(p_keys)
$$;

CREATE OR REPLACE FUNCTION private.diagnostic_report_closed_shape(p_payload jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE
SET search_path = public, private, pg_temp
AS $$
DECLARE v_feedback jsonb := p_payload->'feedback'; v_target jsonb := p_payload->'target';
  v_source jsonb := p_payload->'sourceContext'; v_card jsonb := p_payload->'cardContent';
  v_obs jsonb := p_payload->'observations'; v_item jsonb; v_kind text;
  v_stages text[] := ARRAY['lookup-selection','lookup-fetch','translation-cache','translation-provider','audio-cache','audio-provider','review-mutation','transition-render','report-capture','report-persist','report-send'];
  v_codes text[] := ARRAY['network-interrupted','timeout','unauthorized','forbidden','validation-rejected','provider-unavailable','render-failed','storage-failed','unknown'];
BEGIN
  IF NOT private.jsonb_has_exact_keys(v_feedback, ARRAY['kind','problemType','comment'])
     OR NOT private.jsonb_has_exact_keys(v_obs, ARRAY['capturedAt','timezoneOffsetMinutes','timezoneName','route','browserFamily','browserMajorVersion','osFamily','osMajorVersion','isPwa','isOnline','correlationIds','errorChain','recentEvents','omittedEventCount','actionObservation'])
     OR v_obs->>'route' NOT IN ('training','library','statistics','settings','unknown')
     OR v_obs->>'browserFamily' NOT IN ('chromium','safari','firefox','unknown')
     OR v_obs->>'osFamily' NOT IN ('android','ios','macos','windows','linux','unknown')
     OR v_obs->>'timezoneName' !~ '^[A-Za-z0-9_+/-]{1,64}$'
     OR jsonb_typeof(v_obs->'correlationIds') <> 'array'
     OR jsonb_array_length(v_obs->'correlationIds') > 8
     OR jsonb_typeof(v_obs->'errorChain') <> 'array'
     OR jsonb_array_length(v_obs->'errorChain') > 4
     OR jsonb_typeof(v_obs->'recentEvents') <> 'array'
     OR jsonb_array_length(v_obs->'recentEvents') > 30 THEN RETURN false; END IF;
  IF v_feedback->>'kind' = 'content-quality' AND v_feedback->>'problemType' NOT IN ('wrong-sense','bad-generated-definition','other-content')
     OR v_feedback->>'kind' = 'translation-quality' AND v_feedback->>'problemType' NOT IN ('bad-headword-translation','bad-definition-translation','bad-example-translation','other-translation')
     OR v_feedback->>'kind' = 'rendering' AND v_feedback->>'problemType' <> 'rendering-layout-issue'
     OR v_feedback->>'kind' = 'loading' AND v_feedback->>'problemType' <> 'loading-failure'
     OR v_feedback->>'kind' = 'training-action' AND v_feedback->>'problemType' <> 'training-action-failure'
     OR v_feedback->>'kind' = 'other' AND v_feedback->>'problemType' <> 'other' THEN RETURN false; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_obs->'errorChain') LOOP
    IF NOT private.jsonb_has_exact_keys(v_item, ARRAY['category','stage','safeCode','httpStatus','correlationId','appFrameFingerprints'])
       OR v_item->>'category' NOT IN ('network','timeout','auth','validation','provider','render','storage','unknown')
       OR NOT (v_item->>'stage' = ANY(v_stages)) OR NOT (v_item->>'safeCode' = ANY(v_codes))
       OR jsonb_typeof(v_item->'appFrameFingerprints') <> 'array'
       OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_item->'appFrameFingerprints') x WHERE x !~ '^[0-9a-f]{64}$')
    THEN RETURN false; END IF;
  END LOOP;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_obs->'recentEvents') LOOP
    IF NOT private.jsonb_has_exact_keys(v_item, ARRAY['stage','relativeMs','durationMs','outcome','safeCode','correlationId'])
       OR NOT (v_item->>'stage' = ANY(v_stages))
       OR v_item->>'outcome' NOT IN ('started','succeeded','failed','cancelled','unknown')
       OR (v_item->'safeCode' <> 'null'::jsonb AND NOT (v_item->>'safeCode' = ANY(v_codes)))
    THEN RETURN false; END IF;
  END LOOP;
  IF v_source <> 'null'::jsonb AND (
      NOT private.jsonb_has_exact_keys(v_source, ARRAY['contractVersion','source','location'])
      OR NOT private.jsonb_has_exact_keys(v_source->'source', ARRAY['kind','provider','externalId','languageCode'])
      OR v_source->>'contractVersion' <> 'diagnostic-source-context-v1'
      OR v_source#>>'{source,kind}' <> 'youtube_video' OR v_source#>>'{source,provider}' <> 'youtube'
      OR v_source#>>'{source,externalId}' !~ '^[A-Za-z0-9_-]{11}$'
      OR (v_source->'location' <> 'null'::jsonb AND NOT private.jsonb_has_exact_keys(v_source->'location', ARRAY['kind','startMs','endMs','phraseIndex','locatorConfidence']))
    ) THEN RETURN false; END IF;
  IF v_card <> 'null'::jsonb THEN
    IF NOT private.jsonb_has_exact_keys(v_card, ARRAY['atoms','omittedAtomCount']) OR jsonb_typeof(v_card->'atoms') <> 'array' OR jsonb_array_length(v_card->'atoms') NOT BETWEEN 1 AND 32 THEN RETURN false; END IF;
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_card->'atoms') LOOP
      IF v_item->>'role' = 'displayed-translation' THEN
        IF NOT private.jsonb_has_exact_keys(v_item, ARRAY['role','contentNodeId','text','truncated','artifact'])
           OR jsonb_typeof(v_item->'artifact') IS DISTINCT FROM 'object'
           OR v_item->'contentNodeId' IS DISTINCT FROM v_item->'artifact'->'contentNodeId'
        THEN RETURN false; END IF;
      ELSIF NOT private.jsonb_has_exact_keys(v_item, ARRAY['role','contentNodeId','text','truncated'])
         OR v_item->>'role' NOT IN ('headword','definition','usage-pattern','example','idiom','idiom-explanation','usage-note')
      THEN RETURN false; END IF;
    END LOOP;
  END IF;
  v_kind := v_target->>'kind';
  IF v_kind = 'entry' THEN RETURN private.jsonb_has_exact_keys(v_target, ARRAY['kind','entryId','contentRevision']);
  ELSIF v_kind = 'sense-card' THEN RETURN private.jsonb_has_exact_keys(v_target, ARRAY['kind','entryId','cardTypeId','contentRevision','stateRevision']);
  ELSIF v_kind = 'content-node' THEN RETURN private.jsonb_has_exact_keys(v_target, ARRAY['kind','entryId','contentNodeId','nodeKind','sourceTextFingerprint']);
  ELSIF v_kind = 'translation-artifact' AND v_target->>'targetKind' = 'entry' THEN
    RETURN private.jsonb_has_exact_keys(v_target, ARRAY['kind','targetKind','entryId','contentNodeId','translationId','sourceContentFingerprint','targetLanguageCode','translationPolicyVersion','providerRevision']);
  ELSIF v_kind = 'translation-artifact' AND v_target->>'targetKind' = 'content-node' THEN
    RETURN private.jsonb_has_exact_keys(v_target, ARRAY['kind','targetKind','entryId','contentNodeId','translationId','sourceTextFingerprint','targetLanguageCode','translationPolicyVersion','providerRevision']);
  ELSIF v_kind = 'training-action' THEN RETURN private.jsonb_has_exact_keys(v_target, ARRAY['kind','entryId','cardTypeId','stateRevision','contentRevision','actionId','clientEventId','reviewResult','activeKnownMarkId','knownMarkRevision']);
  ELSIF v_kind = 'app-operation' THEN RETURN private.jsonb_has_exact_keys(v_target, ARRAY['kind','route','stage','operationCorrelationId','entryId']);
  END IF;
  RETURN false;
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION private.diagnostic_report_target_entry_id(p_target jsonb)
RETURNS uuid
LANGUAGE plpgsql IMMUTABLE
SET search_path = public, private, pg_temp
AS $$
BEGIN
    IF p_target->>'kind' = 'app-operation' AND p_target->>'entryId' IS NULL THEN
        RETURN NULL;
    END IF;
    RETURN (p_target->>'entryId')::uuid;
EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid_target';
END;
$$;

CREATE OR REPLACE FUNCTION private.diagnostic_translation_text_at_locator(
    p_overlay jsonb,
    p_locator text,
    p_kind text
)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = public, private, pg_temp
AS $$
DECLARE v_text text;
BEGIN
    v_text := CASE p_locator
        WHEN 'raw.headword' THEN p_overlay->>'headword'
        WHEN 'raw.definition' THEN p_overlay#>>'{meanings,0,definition}'
        WHEN 'raw.example.source' THEN p_overlay#>>'{meanings,0,examples,0}'
        WHEN 'raw.notes' THEN p_overlay#>>'{meanings,0,context}'
        ELSE private.platform_v2_text_at_diagnostic_locator(
            p_overlay,
            p_locator,
            p_kind
        )
    END;
    v_text := NULLIF(trim(v_text), '');
    RETURN CASE WHEN v_text IS NULL THEN NULL ELSE normalize(v_text, NFC) END;
END;
$$;

CREATE OR REPLACE FUNCTION private.verify_diagnostic_displayed_translation_atoms(
    p_entry_id uuid,
    p_atoms jsonb
)
RETURNS boolean
LANGUAGE plpgsql STABLE
SET search_path = public, private, extensions, pg_temp
AS $$
DECLARE
    v_atom jsonb;
    v_artifact jsonb;
    v_expected_text text;
    v_bounded_text text;
    v_translation record;
BEGIN
    IF jsonb_array_length(p_atoms) = 0 THEN RETURN true; END IF;
    IF (
        SELECT count(DISTINCT atom->'artifact'->>'targetLanguageCode')
        FROM jsonb_array_elements(p_atoms) atom
    ) <> 1 THEN
        RAISE EXCEPTION 'translation_atom_not_supported';
    END IF;

    FOR v_atom IN SELECT value FROM jsonb_array_elements(p_atoms) LOOP
        v_artifact := v_atom->'artifact';
        IF v_atom->>'role' IS DISTINCT FROM 'displayed-translation'
           OR v_atom->'contentNodeId' IS DISTINCT FROM v_artifact->'contentNodeId'
        THEN RAISE EXCEPTION 'translation_atom_not_supported'; END IF;

        IF v_artifact->>'targetKind' = 'entry' THEN
            IF NOT private.jsonb_has_exact_keys(v_artifact, ARRAY[
                'targetKind','entryId','contentNodeId','translationId',
                'targetLanguageCode','sourceContentFingerprint',
                'translationPolicyVersion','providerRevision'
            ]) OR v_artifact->>'entryId' IS DISTINCT FROM p_entry_id::text
               OR v_artifact->'contentNodeId' <> 'null'::jsonb
            THEN RAISE EXCEPTION 'translation_atom_not_supported'; END IF;
            SELECT translation.overlay
              INTO v_translation
              FROM public.word_entry_translations translation
             WHERE translation.id = (v_artifact->>'translationId')::uuid
               AND translation.word_entry_id = p_entry_id
               AND translation.status = 'ready'
               AND translation.target_lang = v_artifact->>'targetLanguageCode'
               AND translation.source_content_revision = v_artifact->>'sourceContentFingerprint'
               AND translation.translation_policy_version = v_artifact->>'translationPolicyVersion'
               AND translation.provider_revision IS NOT DISTINCT FROM v_artifact->>'providerRevision';
            v_expected_text := NULLIF(trim(v_translation.overlay->>'headword'), '');
        ELSIF v_artifact->>'targetKind' = 'content-node' THEN
            IF NOT private.jsonb_has_exact_keys(v_artifact, ARRAY[
                'targetKind','entryId','contentNodeId','translationId',
                'targetLanguageCode','sourceTextFingerprint',
                'translationPolicyVersion','providerRevision'
            ]) OR v_artifact->>'entryId' IS DISTINCT FROM p_entry_id::text
            THEN RAISE EXCEPTION 'translation_atom_not_supported'; END IF;
            SELECT translation.overlay, node.diagnostic_locator, node.kind
              INTO v_translation
              FROM public.word_entry_translations translation
              JOIN private.platform_v2_content_nodes node
                ON node.entry_id = translation.word_entry_id
               AND node.id::text = v_artifact->>'contentNodeId'
               AND node.binding_state = 'active'
             WHERE translation.word_entry_id = p_entry_id
               AND translation.status = 'ready'
               AND translation.target_lang = v_artifact->>'targetLanguageCode'
               AND translation.translation_policy_version = v_artifact->>'translationPolicyVersion'
               AND translation.provider_revision IS NOT DISTINCT FROM v_artifact->>'providerRevision'
               AND node.source_text_fingerprint = v_artifact->>'sourceTextFingerprint'
               AND encode(digest(
                    translation.id::text || ':' || node.id::text,
                    'sha256'
               ), 'hex') = v_artifact->>'translationId';
            v_expected_text := private.diagnostic_translation_text_at_locator(
                v_translation.overlay,
                v_translation.diagnostic_locator,
                v_translation.kind
            );
        ELSE
            RAISE EXCEPTION 'translation_atom_not_supported';
        END IF;

        IF v_expected_text IS NULL THEN RAISE EXCEPTION 'stale_target'; END IF;
        v_expected_text := normalize(v_expected_text, NFC);
        v_bounded_text := substring(v_expected_text FROM 1 FOR 1500);
        IF v_atom->>'text' IS DISTINCT FROM v_bounded_text
           OR (v_atom->>'truncated')::boolean
                IS DISTINCT FROM (v_bounded_text IS DISTINCT FROM v_expected_text)
        THEN RAISE EXCEPTION 'translation_atom_not_supported'; END IF;
    END LOOP;
    RETURN true;
EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'translation_atom_not_supported';
END;
$$;

CREATE OR REPLACE FUNCTION private.verify_diagnostic_report_target(
    p_user_id uuid,
    p_target jsonb,
    p_card_content jsonb,
    p_observations jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $$
DECLARE
    v_entry_id uuid;
    v_target_kind text := p_target->>'kind';
    v_expected_card_content jsonb;
    v_source_atoms jsonb;
    v_translation_atoms jsonb;
    v_report_content_revision text;
    v_action_projection jsonb;
    v_action_verified boolean;
    v_card_state jsonb;
    v_node jsonb;
BEGIN
    IF jsonb_typeof(p_target) IS DISTINCT FROM 'object'
       OR v_target_kind NOT IN ('entry', 'sense-card', 'content-node',
          'translation-artifact', 'training-action', 'app-operation') THEN
        RAISE EXCEPTION 'invalid_target';
    END IF;
    v_entry_id := private.diagnostic_report_target_entry_id(p_target);
    IF v_entry_id IS NOT NULL THEN
        PERFORM public.read_platform_v2_presentation_identity(
            p_user_id, ARRAY[v_entry_id], false
        );
    END IF;

    IF v_target_kind <> 'app-operation' THEN
        IF p_card_content IS NULL THEN
            RAISE EXCEPTION 'card_content_mismatch';
        END IF;
        v_report_content_revision := CASE
            WHEN v_target_kind IN ('entry', 'sense-card', 'training-action')
                THEN p_target->>'contentRevision'
            ELSE private.platform_v2_report_atom_revision(v_entry_id)
        END;
        v_expected_card_content := private.project_platform_v2_bounded_report_atoms(
            p_user_id,
            v_entry_id,
            v_report_content_revision
        );
        SELECT COALESCE(jsonb_agg(atom.value ORDER BY atom.ordinality), '[]'::jsonb)
          INTO v_source_atoms
          FROM jsonb_array_elements(p_card_content->'atoms') WITH ORDINALITY atom(value, ordinality)
         WHERE atom.value->>'role' <> 'displayed-translation';
        SELECT COALESCE(jsonb_agg(atom.value ORDER BY atom.ordinality), '[]'::jsonb)
          INTO v_translation_atoms
          FROM jsonb_array_elements(p_card_content->'atoms') WITH ORDINALITY atom(value, ordinality)
         WHERE atom.value->>'role' = 'displayed-translation';
        IF v_source_atoms IS DISTINCT FROM v_expected_card_content->'atoms'
           OR (p_card_content->>'omittedAtomCount')::integer
                < (v_expected_card_content->>'omittedAtomCount')::integer
           OR (
                jsonb_array_length(v_translation_atoms) = 0
                AND v_target_kind <> 'translation-artifact'
                AND (p_card_content->>'omittedAtomCount')::integer
                    IS DISTINCT FROM (v_expected_card_content->>'omittedAtomCount')::integer
           ) THEN
            RAISE EXCEPTION 'report_atoms_mismatch';
        END IF;
        IF jsonb_array_length(v_translation_atoms) > 0 AND EXISTS (
            SELECT 1
              FROM jsonb_array_elements(p_card_content->'atoms')
                   WITH ORDINALITY atom(value, ordinality)
             WHERE atom.value->>'role' <> 'displayed-translation'
               AND atom.ordinality > (
                   SELECT min(candidate.ordinality)
                     FROM jsonb_array_elements(p_card_content->'atoms')
                          WITH ORDINALITY candidate(value, ordinality)
                    WHERE candidate.value->>'role' = 'displayed-translation'
               )
        ) THEN
            RAISE EXCEPTION 'report_atoms_mismatch';
        END IF;
        PERFORM private.verify_diagnostic_displayed_translation_atoms(
            v_entry_id,
            v_translation_atoms
        );
    ELSIF p_card_content IS NOT NULL THEN
        RAISE EXCEPTION 'card_content_mismatch';
    END IF;

    IF v_target_kind = 'sense-card' THEN
        v_card_state := private.platform_v2_card_state_json(
            p_user_id,
            v_entry_id,
            p_target->>'cardTypeId'
        );
        IF v_card_state->>'stateRevision' IS DISTINCT FROM p_target->>'stateRevision' THEN
            RAISE EXCEPTION 'stale_target';
        END IF;
    END IF;

    IF v_target_kind = 'content-node' THEN
        SELECT jsonb_build_object(
            'kind', kind,
            'sourceTextFingerprint', source_text_fingerprint
        ) INTO v_node
        FROM private.platform_v2_content_nodes
        WHERE id = (p_target->>'contentNodeId')::uuid
          AND entry_id = v_entry_id
          AND binding_state = 'active';
        IF v_node IS NULL
           OR v_node->>'kind' IS DISTINCT FROM p_target->>'nodeKind'
           OR v_node->>'sourceTextFingerprint' IS DISTINCT FROM p_target->>'sourceTextFingerprint' THEN
            RAISE EXCEPTION 'stale_target';
        END IF;
    END IF;

    IF v_target_kind = 'training-action' THEN
        v_action_projection := jsonb_build_object(
            'contractVersion', 'platform-action-report-verification-v1',
            'entryId', p_target->>'entryId',
            'cardTypeId', p_target->>'cardTypeId',
            'stateRevision', p_target->>'stateRevision',
            'actionId', p_target->>'actionId',
            'clientEventId', p_target->>'clientEventId',
            'reviewResult', p_target->'reviewResult',
            'activeKnownMarkId', p_target->'activeKnownMarkId',
            'knownMarkRevision', p_target->'knownMarkRevision'
        );
        v_action_verified := public.verify_platform_v2_action_receipt_as_principal(
            p_user_id,
            v_action_projection
        );
        IF v_action_verified THEN
            RETURN 'committed';
        END IF;
        IF EXISTS (
            SELECT 1 FROM public.platform_v2_action_receipts receipt
            WHERE receipt.client_event_id = (p_target->>'clientEventId')::uuid
        ) OR p_observations#>>'{actionObservation,clientObservedOutcome}'
            IN ('accepted', 'duplicate') THEN
            RAISE EXCEPTION 'action_target_mismatch';
        END IF;
        RETURN 'not-found';
    END IF;

    IF v_target_kind = 'translation-artifact' THEN
        IF jsonb_array_length(v_translation_atoms) > 0
           AND NOT EXISTS (
               SELECT 1 FROM jsonb_array_elements(v_translation_atoms) atom
               WHERE atom->'artifact' = p_target - 'kind'
           ) THEN
            RAISE EXCEPTION 'translation_atom_not_supported';
        END IF;
        IF p_target->>'targetKind' = 'entry' AND NOT EXISTS (
            SELECT 1 FROM public.word_entry_translations translation
            WHERE translation.id = (p_target->>'translationId')::uuid
              AND translation.word_entry_id = v_entry_id
              AND translation.status = 'ready'
              AND translation.target_lang = p_target->>'targetLanguageCode'
              AND translation.source_content_revision = p_target->>'sourceContentFingerprint'
              AND translation.translation_policy_version = p_target->>'translationPolicyVersion'
              AND translation.provider_revision IS NOT DISTINCT FROM p_target->>'providerRevision'
        ) THEN RAISE EXCEPTION 'stale_target'; END IF;
        IF p_target->>'targetKind' = 'content-node' AND NOT EXISTS (
            SELECT 1
              FROM public.word_entry_translations translation
              JOIN private.platform_v2_content_nodes node
                ON node.entry_id = translation.word_entry_id
               AND node.id::text = p_target->>'contentNodeId'
               AND node.binding_state = 'active'
             WHERE translation.word_entry_id = v_entry_id
               AND translation.status = 'ready'
               AND translation.target_lang = p_target->>'targetLanguageCode'
               AND translation.translation_policy_version = p_target->>'translationPolicyVersion'
               AND translation.provider_revision IS NOT DISTINCT FROM p_target->>'providerRevision'
               AND node.source_text_fingerprint = p_target->>'sourceTextFingerprint'
               AND encode(digest(
                    translation.id::text || ':' || node.id::text,
                    'sha256'
               ), 'hex') = p_target->>'translationId'
        ) THEN RAISE EXCEPTION 'stale_target'; END IF;
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.read_diagnostic_report_receipt_as_principal(
    p_user_id uuid,
    p_report_id uuid,
    p_payload_hash text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public, private, pg_temp
AS $$
DECLARE v_role text := COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''),
  (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb)->>'role');
  v_receipt public.diagnostic_report_receipts%rowtype;
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF p_user_id IS NULL OR p_report_id IS NULL OR p_payload_hash !~ '^[0-9a-f]{64}$'
  THEN RAISE EXCEPTION 'invalid_report_identity'; END IF;
  SELECT * INTO v_receipt FROM public.diagnostic_report_receipts
   WHERE reporter_user_id=p_user_id AND report_id=p_report_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_receipt.payload_hash IS DISTINCT FROM p_payload_hash THEN
    RETURN jsonb_build_object('status','conflict','reportId',p_report_id);
  END IF;
  RETURN jsonb_build_object('status','duplicate','reportId',p_report_id,
    'feedbackItemId',v_receipt.feedback_item_id,'acceptedAt',v_receipt.accepted_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_diagnostic_report_as_principal(
    p_user_id uuid,
    p_source_client text,
    p_app_build_version text,
    p_report_id uuid,
    p_payload_hash text,
    p_canonical_payload text,
    p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, pg_temp
AS $$
DECLARE
    v_role text := COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''),
      (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb)->>'role');
    v_existing public.diagnostic_report_receipts%rowtype;
    v_feedback_id uuid;
    v_accepted_at timestamptz;
    v_commit_state text;
    v_safe_codes text[];
BEGIN
    IF v_role IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'unauthorized'; END IF;
    IF p_user_id IS NULL OR p_report_id IS NULL OR p_payload_hash !~ '^[0-9a-f]{64}$'
       OR p_payload->>'schemaVersion' IS DISTINCT FROM 'diagnostic-report-v1'
       OR p_payload->>'reportId' IS DISTINCT FROM p_report_id::text
       OR NOT (p_payload ?& ARRAY['schemaVersion','reportId','feedback','target','sourceContext','cardContent','observations'])
       OR (SELECT count(*) FROM jsonb_object_keys(p_payload)) <> 7
       OR octet_length(p_canonical_payload) > 65536
       OR p_canonical_payload::jsonb IS DISTINCT FROM p_payload
       OR NOT private.diagnostic_report_closed_shape(p_payload)
       OR encode(digest(convert_to(p_canonical_payload, 'UTF8'), 'sha256'), 'hex')
          IS DISTINCT FROM p_payload_hash THEN
        RAISE EXCEPTION 'invalid_report';
    END IF;
    IF p_source_client IS NULL OR length(p_source_client) NOT BETWEEN 1 AND 128
       OR p_app_build_version IS NULL OR length(p_app_build_version) NOT BETWEEN 1 AND 128 THEN
        RAISE EXCEPTION 'invalid_server_metadata';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_report_id::text, 0));
    SELECT * INTO v_existing FROM public.diagnostic_report_receipts
      WHERE reporter_user_id = p_user_id AND report_id = p_report_id;
    IF FOUND THEN
        IF v_existing.payload_hash IS DISTINCT FROM p_payload_hash THEN
            RETURN jsonb_build_object('status', 'conflict', 'reportId', p_report_id);
        END IF;
        RETURN jsonb_build_object('status', 'duplicate', 'reportId', p_report_id,
          'feedbackItemId', v_existing.feedback_item_id, 'acceptedAt', v_existing.accepted_at);
    END IF;

    v_commit_state := private.verify_diagnostic_report_target(
        p_user_id,
        p_payload->'target',
        NULLIF(p_payload->'cardContent', 'null'::jsonb),
        p_payload->'observations'
    );
    SELECT COALESCE(array_agg(DISTINCT cause->>'safeCode'), '{}') INTO v_safe_codes
      FROM jsonb_array_elements(p_payload->'observations'->'errorChain') cause;

    INSERT INTO public.feedback_items (
        reporter_user_id, reporter_pseudonym, report_id, source_client, app_build_version, kind,
        problem_type, target_kind, target, source_context, comment_present,
        commit_state, safe_error_codes
    ) VALUES (
        p_user_id,
        'usr_' || substr(encode(digest('diagnostic-reporter-v1:' || p_user_id::text, 'sha256'), 'hex'), 1, 24),
        p_report_id, p_source_client, p_app_build_version,
        p_payload->'feedback'->>'kind', p_payload->'feedback'->>'problemType',
        p_payload->'target'->>'kind', p_payload->'target', p_payload->'sourceContext',
        p_payload->'feedback'->'comment' <> 'null'::jsonb,
        v_commit_state, v_safe_codes
    ) RETURNING id INTO v_feedback_id;

    INSERT INTO public.diagnostic_report_receipts (
        reporter_user_id, report_id, payload_hash, feedback_item_id
    ) VALUES (p_user_id, p_report_id, p_payload_hash, v_feedback_id)
    RETURNING accepted_at INTO v_accepted_at;

    INSERT INTO public.diagnostic_envelopes (
        feedback_item_id, reporter_user_id, report_id, payload_hash, canonical_payload
    ) VALUES (v_feedback_id, p_user_id, p_report_id, p_payload_hash, p_canonical_payload);

    RETURN jsonb_build_object('status', 'accepted', 'reportId', p_report_id,
      'feedbackItemId', v_feedback_id, 'acceptedAt', v_accepted_at,
      'commitState', v_commit_state);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_expired_diagnostic_envelopes(p_now timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE v_count integer;
BEGIN
  IF COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''),
      (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb)->>'role') IS DISTINCT FROM 'service_role'
  THEN RAISE EXCEPTION 'unauthorized'; END IF;
  DELETE FROM public.diagnostic_envelopes WHERE expires_at <= p_now;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.query_feedback_items_admin(
  p_kind text DEFAULT NULL, p_target_kind text DEFAULT NULL,
  p_target_entry_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL, p_source_client text DEFAULT NULL,
  p_app_build_version text DEFAULT NULL, p_safe_code text DEFAULT NULL,
  p_created_from timestamptz DEFAULT NULL, p_created_to timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  feedback_item_id uuid,
  report_id uuid,
  reporter_pseudonym text,
  source_client text,
  app_build_version text,
  kind text,
  problem_type text,
  target_kind text,
  target jsonb,
  source_context jsonb,
  comment_present boolean,
  sanitized_summary text,
  status text,
  resolution text,
  duplicate_of_id uuid,
  github_url text,
  commit_state text,
  safe_error_codes text[],
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''),
      (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb)->>'role') IS DISTINCT FROM 'service_role'
  THEN RAISE EXCEPTION 'unauthorized'; END IF;
  RETURN QUERY SELECT
     item.id, item.report_id, item.reporter_pseudonym, item.source_client,
     item.app_build_version, item.kind, item.problem_type, item.target_kind,
     item.target, item.source_context, item.comment_present,
     item.sanitized_summary, item.status, item.resolution,
     item.duplicate_of_id, item.github_url, item.commit_state,
     item.safe_error_codes, item.created_at, item.updated_at
   FROM public.feedback_items item
   WHERE (p_kind IS NULL OR item.kind = p_kind)
     AND (p_target_kind IS NULL OR item.target_kind = p_target_kind)
     AND (p_target_entry_id IS NULL OR item.target->>'entryId' = p_target_entry_id::text)
     AND (p_status IS NULL OR item.status = p_status)
     AND (p_source_client IS NULL OR item.source_client = p_source_client)
     AND (p_app_build_version IS NULL OR item.app_build_version = p_app_build_version)
     AND (p_safe_code IS NULL OR p_safe_code = ANY(item.safe_error_codes))
     AND (p_created_from IS NULL OR item.created_at >= p_created_from)
     AND (p_created_to IS NULL OR item.created_at < p_created_to)
   ORDER BY item.created_at DESC LIMIT LEAST(GREATEST(p_limit, 1), 200);
END;
$$;

REVOKE ALL ON FUNCTION private.diagnostic_report_target_entry_id(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.jsonb_has_exact_keys(jsonb,text[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.diagnostic_report_closed_shape(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.verify_diagnostic_report_target(uuid,jsonb,jsonb,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.diagnostic_translation_text_at_locator(jsonb,text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.verify_diagnostic_displayed_translation_atoms(uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.submit_diagnostic_report_as_principal(uuid,text,text,uuid,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.read_diagnostic_report_receipt_as_principal(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_expired_diagnostic_envelopes(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.query_feedback_items_admin(text,text,uuid,text,text,text,text,timestamptz,timestamptz,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_diagnostic_report_as_principal(uuid,text,text,uuid,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_diagnostic_report_receipt_as_principal(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_expired_diagnostic_envelopes(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.query_feedback_items_admin(text,text,uuid,text,text,text,text,timestamptz,timestamptz,integer) TO service_role;

COMMIT;
