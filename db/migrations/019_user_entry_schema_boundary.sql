-- User-owned dictionary entry schema and private editable dictionary container.

INSERT INTO dictionary_schemas (
    schema_key,
    version,
    language_code,
    title,
    description,
    json_schema,
    source_path,
    render_capabilities
)
VALUES (
    'user-entry-v1',
    1,
    NULL,
    'User dictionary entry schema',
    'Minimal editable dictionary entry payload for user-owned dictionaries.',
    '{
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "https://2000nl.app/schemas/user-entry-v1.schema.json",
      "title": "User dictionary entry v1",
      "type": "object",
      "additionalProperties": false,
      "required": ["headword", "languageCode"],
      "properties": {
        "headword": { "type": "string", "minLength": 1 },
        "languageCode": { "type": "string", "minLength": 2 },
        "definition": { "type": "string", "minLength": 1 },
        "translation": {
          "type": "object",
          "additionalProperties": false,
          "required": ["text"],
          "properties": {
            "languageCode": { "type": "string", "minLength": 2 },
            "text": { "type": "string", "minLength": 1 }
          }
        },
        "example": {
          "type": "object",
          "additionalProperties": false,
          "required": ["source"],
          "properties": {
            "source": { "type": "string", "minLength": 1 },
            "translation": { "type": "string", "minLength": 1 }
          }
        },
        "partOfSpeech": { "type": "string", "minLength": 1 },
        "gender": { "type": "string", "minLength": 1 },
        "notes": { "type": "string", "minLength": 1 },
        "tags": {
          "type": "array",
          "items": { "type": "string", "minLength": 1 },
          "uniqueItems": true
        },
        "sourceEntryId": { "type": "string", "minLength": 1 }
      },
      "anyOf": [
        { "required": ["definition"] },
        { "required": ["translation"] },
        { "required": ["example"] },
        { "required": ["notes"] }
      ]
    }'::jsonb,
    'packages/shared/schemas/user-entry-v1.schema.json',
    ARRAY['definitions', 'translations', 'examples']
)
ON CONFLICT (schema_key, version) DO UPDATE
SET language_code = excluded.language_code,
    title = excluded.title,
    description = excluded.description,
    json_schema = excluded.json_schema,
    source_path = excluded.source_path,
    render_capabilities = excluded.render_capabilities;

CREATE OR REPLACE FUNCTION ensure_user_dictionary(
    p_user_id uuid,
    p_language_code text DEFAULT 'nl',
    p_name text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
    v_dictionary_id uuid;
    v_language_code text := COALESCE(NULLIF(trim(p_language_code), ''), 'nl');
    v_name text := COALESCE(NULLIF(trim(p_name), ''), 'My dictionary');
    v_slug text;
BEGIN
    IF p_user_id IS NULL OR p_user_id != (select auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM languages WHERE code = v_language_code) THEN
        RAISE EXCEPTION 'language_not_found';
    END IF;

    v_slug := 'user-' || replace(p_user_id::text, '-', '') || '-' || v_language_code;

    INSERT INTO dictionaries (
        language_code,
        slug,
        name,
        description,
        kind,
        visibility,
        owner_user_id,
        is_editable,
        minimum_subscription_tier,
        schema_key,
        schema_version,
        source_provider
    )
    VALUES (
        v_language_code,
        v_slug,
        v_name,
        'Private user-owned editable dictionary.',
        'user',
        'private',
        p_user_id,
        true,
        'free',
        'user-entry-v1',
        1,
        'user'
    )
    ON CONFLICT (language_code, slug) DO UPDATE
    SET name = excluded.name,
        owner_user_id = excluded.owner_user_id,
        is_editable = true,
        schema_key = 'user-entry-v1',
        schema_version = 1,
        updated_at = now()
    RETURNING id INTO v_dictionary_id;

    RETURN v_dictionary_id;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION ensure_user_dictionary(uuid, text, text) TO authenticated;
