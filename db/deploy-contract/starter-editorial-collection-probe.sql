-- Read-only check of the fresh-install starter collection contract.
DO $starter_collection$
DECLARE definition text;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='private.starter_training_config'::regclass
   AND attname='collection_id' AND NOT attisdropped) THEN
  RAISE EXCEPTION 'db-contract-gate: starter collection configuration missing';
 END IF;
 definition:=pg_get_functiondef('private.initialize_starter_training_v1(uuid)'::regprocedure);
 IF strpos(definition,'''starter_collection_unavailable''')=0
   OR strpos(definition,'''Dilum 100''')=0
   OR strpos(definition,'''materialMode'',''collection''')=0 THEN
  RAISE EXCEPTION 'db-contract-gate: starter collection recipe missing';
 END IF;
END;
$starter_collection$;
