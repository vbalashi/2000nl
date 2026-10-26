DO $copy_hybrid_content$
DECLARE value jsonb;
BEGIN
 value:=private.portable_owned_entry_content_v1('{"definition":"legacy visible definition","example":{"source":"legacy example"},"meanings":[{"translations":{"en":"word"}}]}');
 IF value#>>'{meanings,0,definition}' IS DISTINCT FROM 'legacy visible definition'
  OR value#>>'{meanings,0,examples,0}' IS DISTINCT FROM 'legacy example'
  OR value#>>'{meanings,0,translations,en}' IS DISTINCT FROM 'word' THEN
  RAISE EXCEPTION 'db-contract-gate: hybrid copy lost visible legacy content';
 END IF;
 value:=private.copy_source_content_v1('{"notes":"legacy note definition","meanings":[{"translations":{"en":"word"},"note":"   "}]}',null,'curated');
 IF value#>>'{meanings,0,definition}' IS DISTINCT FROM 'legacy note definition'
  OR NULLIF(trim(value->>'notes'),'') IS NOT NULL
  OR has_function_privilege('authenticated','private.copy_source_content_v1(jsonb,text,text)','EXECUTE')
  OR has_function_privilege('anon','private.copy_source_content_v1(jsonb,text,text)','EXECUTE')
  OR has_function_privilege('service_role','private.copy_source_content_v1(jsonb,text,text)','EXECUTE') THEN
  RAISE EXCEPTION 'db-contract-gate: source-aware legacy note fallback/privacy missing';
 END IF;
 value:=private.copy_source_content_v1('{"notes":"owned note","meanings":[{"translations":{"en":"word"}}]}',null,'user');
 IF value#>>'{meanings,0,definition}' IS NOT NULL OR value->>'notes' IS DISTINCT FROM 'owned note' THEN
  RAISE EXCEPTION 'db-contract-gate: owned notes changed into fabricated definitions';
 END IF;
END;
$copy_hybrid_content$;
