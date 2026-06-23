-- Generated user dictionary entry metadata for platform lookup-miss fallback.

UPDATE dictionary_schemas
SET json_schema = jsonb_set(
        json_schema,
        '{properties,generation}',
        '{
          "type": "object",
          "additionalProperties": false,
          "required": ["kind", "source"],
          "properties": {
            "kind": { "const": "llm" },
            "provider": { "type": "string", "minLength": 1 },
            "model": { "type": "string", "minLength": 1 },
            "promptVersion": { "type": "string", "minLength": 1 },
            "generatedAt": { "type": "string", "minLength": 1 },
            "contentFingerprint": { "type": "string", "minLength": 1 },
            "source": {
              "type": "object",
              "additionalProperties": true,
              "required": ["clickedForm", "languageCode"],
              "properties": {
                "clickedForm": { "type": "string", "minLength": 1 },
                "languageCode": { "type": "string", "minLength": 2 },
                "contextText": { "type": "string", "minLength": 1 },
                "connectedClientId": { "type": ["string", "null"] }
              }
            }
          }
        }'::jsonb,
        true
    ),
    render_capabilities = ARRAY['definitions', 'translations', 'examples'],
    source_path = 'packages/shared/schemas/user-entry-v1.schema.json'
WHERE schema_key = 'user-entry-v1'
  AND version = 1;

CREATE OR REPLACE FUNCTION validate_user_entry_v1_payload(
    p_payload jsonb,
    p_dictionary_language_code text
) RETURNS jsonb AS $$
DECLARE
    v_payload jsonb := COALESCE(p_payload, '{}'::jsonb);
    v_headword text := NULLIF(trim(v_payload->>'headword'), '');
    v_language_code text := NULLIF(trim(v_payload->>'languageCode'), '');
BEGIN
    IF jsonb_typeof(v_payload) <> 'object' THEN
        RAISE EXCEPTION 'invalid_user_entry';
    END IF;

    IF v_headword IS NULL OR v_language_code IS NULL THEN
        RAISE EXCEPTION 'invalid_user_entry';
    END IF;

    IF v_language_code <> p_dictionary_language_code THEN
        RAISE EXCEPTION 'language_mismatch';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM languages WHERE code = v_language_code) THEN
        RAISE EXCEPTION 'language_not_found';
    END IF;

    IF NOT (
        NULLIF(trim(v_payload->>'definition'), '') IS NOT NULL
        OR (
            jsonb_typeof(v_payload->'translation') = 'object'
            AND NULLIF(trim(v_payload#>>'{translation,text}'), '') IS NOT NULL
        )
        OR (
            jsonb_typeof(v_payload->'example') = 'object'
            AND NULLIF(trim(v_payload#>>'{example,source}'), '') IS NOT NULL
        )
        OR NULLIF(trim(v_payload->>'notes'), '') IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'invalid_user_entry';
    END IF;

    RETURN jsonb_strip_nulls(
        jsonb_build_object(
            'headword', v_headword,
            'languageCode', v_language_code,
            'definition', NULLIF(trim(v_payload->>'definition'), ''),
            'translation', CASE
                WHEN jsonb_typeof(v_payload->'translation') = 'object' THEN
                    jsonb_strip_nulls(jsonb_build_object(
                        'languageCode', NULLIF(trim(v_payload#>>'{translation,languageCode}'), ''),
                        'text', NULLIF(trim(v_payload#>>'{translation,text}'), '')
                    ))
                ELSE NULL
            END,
            'example', CASE
                WHEN jsonb_typeof(v_payload->'example') = 'object' THEN
                    jsonb_strip_nulls(jsonb_build_object(
                        'source', NULLIF(trim(v_payload#>>'{example,source}'), ''),
                        'translation', NULLIF(trim(v_payload#>>'{example,translation}'), '')
                    ))
                ELSE NULL
            END,
            'partOfSpeech', NULLIF(trim(v_payload->>'partOfSpeech'), ''),
            'gender', NULLIF(trim(v_payload->>'gender'), ''),
            'notes', NULLIF(trim(v_payload->>'notes'), ''),
            'tags', CASE
                WHEN jsonb_typeof(v_payload->'tags') = 'array' THEN v_payload->'tags'
                ELSE NULL
            END,
            'sourceEntryId', NULLIF(trim(v_payload->>'sourceEntryId'), ''),
            'generation', CASE
                WHEN jsonb_typeof(v_payload->'generation') = 'object' THEN v_payload->'generation'
                ELSE NULL
            END
        )
    );
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE;

GRANT EXECUTE ON FUNCTION validate_user_entry_v1_payload(jsonb, text) TO authenticated;
