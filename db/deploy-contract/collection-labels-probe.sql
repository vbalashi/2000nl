-- Read-only deployment assertion; do not create users or organization data.
DO $collection_labels_contract$
DECLARE
    v_table regclass;
    v_function regprocedure;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'private.collection_label_catalogs'::regclass,
        'private.collection_labels'::regclass,
        'private.collection_label_assignments'::regclass
    ] LOOP
        IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = v_table)
           OR EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = v_table)
           OR has_table_privilege('anon', v_table, 'SELECT,INSERT,UPDATE,DELETE')
           OR has_table_privilege('authenticated', v_table, 'SELECT,INSERT,UPDATE,DELETE')
           OR has_table_privilege('service_role', v_table, 'SELECT,INSERT,UPDATE,DELETE') THEN
            RAISE EXCEPTION 'db-contract-gate: collection label storage is not closed: %', v_table;
        END IF;
    END LOOP;
    FOREACH v_function IN ARRAY ARRAY[
        'public.read_collection_labels_v1(uuid)'::regprocedure,
        'public.mutate_collection_labels_v1(uuid,bigint,jsonb)'::regprocedure
    ] LOOP
        IF NOT (SELECT prosecdef AND proconfig @> ARRAY['search_path=public, private, pg_temp']
                FROM pg_proc WHERE oid = v_function)
           OR has_function_privilege('anon', v_function, 'EXECUTE')
           OR has_function_privilege('service_role', v_function, 'EXECUTE')
           OR NOT has_function_privilege('authenticated', v_function, 'EXECUTE') THEN
            RAISE EXCEPTION 'db-contract-gate: collection label RPC boundary changed: %', v_function;
        END IF;
    END LOOP;
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'public.user_word_lists'::regclass
          AND tgname = 'collection_labels_before_collection_delete'
          AND tgfoid = 'private.collection_labels_before_collection_delete_v1()'::regprocedure
          AND NOT tgisinternal AND tgenabled = 'O'
    ) OR has_function_privilege('authenticated',
        'private.collection_labels_before_collection_delete_v1()', 'EXECUTE') THEN
        RAISE EXCEPTION 'db-contract-gate: collection delete revision invalidation changed';
    END IF;
END;
$collection_labels_contract$;
