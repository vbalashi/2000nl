BEGIN;
-- Caller must already hold the complete admitted writer cohort. This assertion
-- validates the server-bound revision; it never authorizes a write by itself.
CREATE FUNCTION private.assert_collection_audience_revision_v1(p_owner uuid,p_collection uuid,p_expected_revision text) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,private,pg_temp AS $$
BEGIN
 IF p_expected_revision IS NULL OR p_expected_revision !~ '^[0-9a-f]{64}$'
  OR private.collection_composition_revision_v1(p_owner,p_collection) IS DISTINCT FROM p_expected_revision THEN
  RAISE EXCEPTION 'collection_audience_changed' USING ERRCODE='40001'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.assert_collection_audience_revision_v1(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
