-- Reconcile manifest bindings and Content Nodes in bounded batches, then
-- refresh the derived ordinary-direct projection once for each affected entry.

BEGIN;

CREATE OR REPLACE FUNCTION private.refresh_unrenderable_ordinary_direct_entries_v1(
  p_entry_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
BEGIN
  IF COALESCE(cardinality(p_entry_ids), 0) = 0 THEN
    RETURN;
  END IF;

  DELETE FROM private.unrenderable_ordinary_direct_entries_v1 AS projection
  USING unnest(p_entry_ids) AS affected(entry_id)
  WHERE projection.entry_id = affected.entry_id;

  WITH affected AS MATERIALIZED (
    SELECT DISTINCT entry_id FROM unnest(p_entry_ids) AS input(entry_id)
  ), root_content AS MATERIALIZED (
    SELECT node.entry_id,
           bool_or(node.kind = 'definition') AS has_definition,
           bool_or(node.kind = 'example') AS has_example
    FROM private.platform_v2_content_nodes AS node
    JOIN affected ON affected.entry_id = node.entry_id
    WHERE node.binding_state = 'active'
      AND node.parent_content_node_id IS NULL
      AND node.kind IN ('definition', 'example')
    GROUP BY node.entry_id
  ), eligible_bound AS MATERIALIZED (
    SELECT DISTINCT current_binding.word_entry_id
    FROM private.source_entry_bindings AS current_binding
    JOIN affected ON affected.entry_id = current_binding.word_entry_id
    JOIN private.source_entry_bindings AS predecessor_binding
      ON predecessor_binding.dictionary_id = current_binding.dictionary_id
     AND predecessor_binding.identity_scheme_version =
         current_binding.identity_scheme_version
     AND predecessor_binding.source_group_key = current_binding.source_group_key
     AND predecessor_binding.sense_ordinal < current_binding.sense_ordinal
     AND predecessor_binding.binding_state = 'active'
    JOIN private.platform_v2_content_nodes AS predecessor_definition
      ON predecessor_definition.entry_id = predecessor_binding.word_entry_id
     AND predecessor_definition.binding_state = 'active'
     AND predecessor_definition.parent_content_node_id IS NULL
     AND predecessor_definition.kind = 'definition'
    WHERE current_binding.binding_state = 'active'
  )
  INSERT INTO private.unrenderable_ordinary_direct_entries_v1 (
    entry_id, updated_at
  )
  SELECT entry.id, now()
  FROM affected
  JOIN public.word_entries AS entry ON entry.id = affected.entry_id
  JOIN root_content ON root_content.entry_id = entry.id
  LEFT JOIN private.source_entry_bindings AS current_binding
    ON current_binding.word_entry_id = entry.id
   AND current_binding.binding_state = 'active'
  LEFT JOIN eligible_bound ON eligible_bound.word_entry_id = entry.id
  WHERE root_content.has_definition
    AND NOT root_content.has_example
    AND (
      eligible_bound.word_entry_id IS NOT NULL
      OR (
        current_binding.word_entry_id IS NULL
        AND COALESCE(entry.meaning_id, 1) > 1
      )
    );
END;
$function$;

CREATE OR REPLACE FUNCTION private.sync_unrenderable_ordinary_direct_entry_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
DECLARE
  v_binding private.source_entry_bindings%rowtype;
  v_entry_id uuid := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.entry_id ELSE NEW.entry_id
  END;
BEGIN
  IF to_regclass('pg_temp.platform_v2_import_refresh_entries') IS NOT NULL THEN
    INSERT INTO pg_temp.platform_v2_import_refresh_entries (entry_id)
    VALUES (v_entry_id)
    ON CONFLICT DO NOTHING;

    INSERT INTO pg_temp.platform_v2_import_refresh_groups (
      dictionary_id, identity_scheme_version, source_group_key
    )
    SELECT binding.dictionary_id,
           binding.identity_scheme_version,
           binding.source_group_key
    FROM private.source_entry_bindings AS binding
    WHERE binding.word_entry_id = v_entry_id
      AND binding.binding_state = 'active'
    ON CONFLICT DO NOTHING;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  SELECT * INTO v_binding
  FROM private.source_entry_bindings AS binding
  WHERE binding.word_entry_id = v_entry_id
    AND binding.binding_state = 'active';
  IF FOUND THEN
    PERFORM private.refresh_unrenderable_ordinary_direct_group_v1(
      v_binding.dictionary_id,
      v_binding.identity_scheme_version,
      v_binding.source_group_key
    );
  ELSE
    PERFORM private.refresh_unrenderable_ordinary_direct_entry_v1(v_entry_id);
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

CREATE OR REPLACE FUNCTION private.sync_unrenderable_ordinary_direct_binding_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
BEGIN
  IF to_regclass('pg_temp.platform_v2_import_refresh_entries') IS NOT NULL THEN
    IF TG_OP <> 'INSERT' THEN
      INSERT INTO pg_temp.platform_v2_import_refresh_entries (entry_id)
      VALUES (OLD.word_entry_id)
      ON CONFLICT DO NOTHING;
      INSERT INTO pg_temp.platform_v2_import_refresh_groups (
        dictionary_id, identity_scheme_version, source_group_key
      ) VALUES (
        OLD.dictionary_id, OLD.identity_scheme_version, OLD.source_group_key
      ) ON CONFLICT DO NOTHING;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      INSERT INTO pg_temp.platform_v2_import_refresh_entries (entry_id)
      VALUES (NEW.word_entry_id)
      ON CONFLICT DO NOTHING;
      INSERT INTO pg_temp.platform_v2_import_refresh_groups (
        dictionary_id, identity_scheme_version, source_group_key
      ) VALUES (
        NEW.dictionary_id, NEW.identity_scheme_version, NEW.source_group_key
      ) ON CONFLICT DO NOTHING;
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP <> 'INSERT' THEN
    PERFORM private.refresh_unrenderable_ordinary_direct_group_v1(
      OLD.dictionary_id, OLD.identity_scheme_version, OLD.source_group_key
    );
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM private.refresh_unrenderable_ordinary_direct_group_v1(
      NEW.dictionary_id, NEW.identity_scheme_version, NEW.source_group_key
    );
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

CREATE OR REPLACE FUNCTION private.begin_platform_v2_source_import_v1()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
BEGIN
  IF to_regclass('pg_temp.platform_v2_import_refresh_entries') IS NOT NULL THEN
    RAISE EXCEPTION 'platform_v2_source_import_already_started';
  END IF;

  CREATE TEMP TABLE pg_temp.platform_v2_import_refresh_entries (
    entry_id uuid PRIMARY KEY
  ) ON COMMIT DROP;
  CREATE TEMP TABLE pg_temp.platform_v2_import_refresh_groups (
    dictionary_id uuid NOT NULL,
    identity_scheme_version text NOT NULL,
    source_group_key text NOT NULL,
    PRIMARY KEY (dictionary_id, identity_scheme_version, source_group_key)
  ) ON COMMIT DROP;
END;
$function$;

CREATE OR REPLACE FUNCTION private.drain_platform_v2_source_import_v1()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
DECLARE
  v_affected_entry_ids uuid[];
  v_count integer;
  v_offset integer;
BEGIN
  IF to_regclass('pg_temp.platform_v2_import_refresh_entries') IS NULL
     OR to_regclass('pg_temp.platform_v2_import_refresh_groups') IS NULL THEN
    RETURN 0;
  END IF;

  SELECT array_agg(DISTINCT affected.entry_id)
  INTO v_affected_entry_ids
  FROM (
    SELECT queued.entry_id
    FROM pg_temp.platform_v2_import_refresh_entries AS queued
    UNION
    SELECT binding.word_entry_id
    FROM pg_temp.platform_v2_import_refresh_groups AS queued_group
    JOIN private.source_entry_bindings AS binding
      ON binding.dictionary_id = queued_group.dictionary_id
     AND binding.identity_scheme_version =
         queued_group.identity_scheme_version
     AND binding.source_group_key = queued_group.source_group_key
     AND binding.binding_state = 'active'
  ) AS affected;

  v_count := COALESCE(cardinality(v_affected_entry_ids), 0);
  TRUNCATE pg_temp.platform_v2_import_refresh_groups;
  TRUNCATE pg_temp.platform_v2_import_refresh_entries;

  v_offset := 1;
  WHILE v_offset <= v_count LOOP
    PERFORM private.refresh_unrenderable_ordinary_direct_entries_v1(
      v_affected_entry_ids[
        v_offset:LEAST(v_offset + 499, v_count)
      ]
    );
    v_offset := v_offset + 500;
  END LOOP;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION private.flush_platform_v2_source_import_v1()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF to_regclass('pg_temp.platform_v2_import_refresh_entries') IS NULL
     OR to_regclass('pg_temp.platform_v2_import_refresh_groups') IS NULL THEN
    RETURN 0;
  END IF;
  v_count := private.drain_platform_v2_source_import_v1();
  DROP TABLE pg_temp.platform_v2_import_refresh_groups;
  DROP TABLE pg_temp.platform_v2_import_refresh_entries;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION private.finish_platform_v2_source_import_v1()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
BEGIN
  IF to_regclass('pg_temp.platform_v2_import_refresh_entries') IS NULL THEN
    RAISE EXCEPTION 'platform_v2_source_import_not_started';
  END IF;
  RETURN private.flush_platform_v2_source_import_v1();
END;
$function$;

CREATE OR REPLACE FUNCTION private.reconcile_platform_v2_source_batch_v1(
  p_rows jsonb,
  p_drain_after_batch boolean DEFAULT true
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
DECLARE
  v_row record;
  v_owns_import boolean := false;
BEGIN
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_rows) = 0
     OR jsonb_array_length(p_rows) > 500 THEN
    RAISE EXCEPTION 'platform_v2_invalid_source_batch';
  END IF;

  IF to_regclass('pg_temp.platform_v2_import_refresh_entries') IS NULL THEN
    PERFORM private.begin_platform_v2_source_import_v1();
    v_owns_import := true;
  END IF;

  CREATE TEMP TABLE pg_temp.platform_v2_import_source_rows (
    dictionary_id uuid NOT NULL,
    identity_scheme_version text NOT NULL,
    source_entry_key text NOT NULL,
    source_group_key text NOT NULL,
    sense_ordinal integer NOT NULL,
    word_entry_id uuid NOT NULL,
    run_id uuid NOT NULL,
    manifest_checksum text NOT NULL,
    content_fingerprint_version text NOT NULL,
    content_fingerprint text NOT NULL,
    identity_evidence jsonb NOT NULL,
    reconciliation_decision jsonb NOT NULL,
    nodes jsonb NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO pg_temp.platform_v2_import_source_rows
  SELECT *
  FROM jsonb_to_recordset(p_rows) AS source(
    dictionary_id uuid,
    identity_scheme_version text,
    source_entry_key text,
    source_group_key text,
    sense_ordinal integer,
    word_entry_id uuid,
    run_id uuid,
    manifest_checksum text,
    content_fingerprint_version text,
    content_fingerprint text,
    identity_evidence jsonb,
    reconciliation_decision jsonb,
    nodes jsonb
  );

  INSERT INTO private.source_entry_bindings (
    dictionary_id,
    identity_scheme_version,
    source_entry_key,
    source_group_key,
    sense_ordinal,
    word_entry_id,
    binding_state,
    first_seen_run_id,
    last_seen_run_id,
    manifest_checksum,
    content_fingerprint_version,
    content_fingerprint,
    identity_evidence,
    reconciliation_decision
  )
  SELECT source.dictionary_id,
         source.identity_scheme_version,
         source.source_entry_key,
         source.source_group_key,
         source.sense_ordinal,
         source.word_entry_id,
         'active',
         source.run_id,
         source.run_id,
         source.manifest_checksum,
         source.content_fingerprint_version,
         source.content_fingerprint,
         source.identity_evidence,
         source.reconciliation_decision
  FROM pg_temp.platform_v2_import_source_rows AS source
  ON CONFLICT (
    dictionary_id, identity_scheme_version, source_entry_key
  ) DO UPDATE SET
    source_group_key = excluded.source_group_key,
    sense_ordinal = excluded.sense_ordinal,
    word_entry_id = excluded.word_entry_id,
    binding_state = 'active',
    last_seen_run_id = excluded.last_seen_run_id,
    manifest_checksum = excluded.manifest_checksum,
    content_fingerprint_version = excluded.content_fingerprint_version,
    content_fingerprint = excluded.content_fingerprint,
    identity_evidence = excluded.identity_evidence,
    reconciliation_decision = excluded.reconciliation_decision,
    updated_at = now();

  FOR v_row IN
    SELECT source.word_entry_id,
           source.manifest_checksum,
           source.nodes
    FROM pg_temp.platform_v2_import_source_rows AS source
  LOOP
    PERFORM private.reconcile_platform_v2_content_nodes(
      v_row.word_entry_id,
      v_row.manifest_checksum,
      v_row.nodes
    );
  END LOOP;

  DROP TABLE pg_temp.platform_v2_import_source_rows;
  IF v_owns_import THEN
    RETURN private.finish_platform_v2_source_import_v1();
  END IF;
  IF p_drain_after_batch THEN
    RETURN private.drain_platform_v2_source_import_v1();
  END IF;

  RETURN 0;
END;
$function$;

CREATE OR REPLACE FUNCTION private.ensure_platform_v2_source_import_flushed_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $function$
BEGIN
  PERFORM private.flush_platform_v2_source_import_v1();
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS ensure_platform_v2_content_import_flushed_v1
  ON private.platform_v2_content_nodes;
CREATE CONSTRAINT TRIGGER ensure_platform_v2_content_import_flushed_v1
AFTER INSERT OR DELETE OR UPDATE
ON private.platform_v2_content_nodes
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION private.ensure_platform_v2_source_import_flushed_v1();

DROP TRIGGER IF EXISTS ensure_platform_v2_binding_import_flushed_v1
  ON private.source_entry_bindings;
CREATE CONSTRAINT TRIGGER ensure_platform_v2_binding_import_flushed_v1
AFTER INSERT OR DELETE OR UPDATE
ON private.source_entry_bindings
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION private.ensure_platform_v2_source_import_flushed_v1();

ALTER FUNCTION private.refresh_unrenderable_ordinary_direct_entries_v1(uuid[])
  OWNER TO postgres;
ALTER FUNCTION private.sync_unrenderable_ordinary_direct_entry_v1()
  OWNER TO postgres;
ALTER FUNCTION private.sync_unrenderable_ordinary_direct_binding_v1()
  OWNER TO postgres;
ALTER FUNCTION private.reconcile_platform_v2_source_batch_v1(jsonb, boolean)
  OWNER TO postgres;
ALTER FUNCTION private.begin_platform_v2_source_import_v1() OWNER TO postgres;
ALTER FUNCTION private.drain_platform_v2_source_import_v1() OWNER TO postgres;
ALTER FUNCTION private.flush_platform_v2_source_import_v1() OWNER TO postgres;
ALTER FUNCTION private.finish_platform_v2_source_import_v1() OWNER TO postgres;
ALTER FUNCTION private.ensure_platform_v2_source_import_flushed_v1()
  OWNER TO postgres;

REVOKE ALL ON FUNCTION private.refresh_unrenderable_ordinary_direct_entries_v1(uuid[])
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.reconcile_platform_v2_source_batch_v1(jsonb, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.begin_platform_v2_source_import_v1()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.drain_platform_v2_source_import_v1()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.flush_platform_v2_source_import_v1()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.finish_platform_v2_source_import_v1()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.ensure_platform_v2_source_import_flushed_v1()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
