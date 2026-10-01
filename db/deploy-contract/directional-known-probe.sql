BEGIN READ ONLY;
DO $probe$
DECLARE v_default text;
BEGIN
 SELECT pg_get_expr(d.adbin, d.adrelid) INTO v_default
 FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE a.attrelid='public.user_card_known_marks'::regclass AND a.attname='mark_scope';
 IF v_default IS DISTINCT FROM '''direction''::text' THEN
  RAISE EXCEPTION 'directional Known default';
 END IF;
 IF strpos(pg_get_functiondef('private.sync_shared_meaning_known_mark()'::regprocedure),
  'NEW.mark_scope <> ''meaning''')=0 OR
  strpos(pg_get_functiondef('private.sync_shared_meaning_known_mark()'::regprocedure),
  'sibling.mark_event_id = NEW.mark_event_id')=0 THEN
  RAISE EXCEPTION 'directional Known and historical Undo boundary';
 END IF;
 IF has_table_privilege('authenticated','public.user_card_known_marks','INSERT') OR
    has_table_privilege('authenticated','public.user_card_known_marks','UPDATE') THEN
  RAISE EXCEPTION 'Known scope must remain server-owned';
 END IF;
END;
$probe$;
COMMIT;
