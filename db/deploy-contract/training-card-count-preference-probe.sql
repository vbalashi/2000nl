DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = 'public.user_settings'::regclass
      AND a.attname = 'training_always_show_card_count'
      AND a.atttypid = 'boolean'::regtype AND a.attnotnull AND NOT a.attisdropped
      AND pg_get_expr(d.adbin, d.adrelid) = 'false'
  ) THEN
    RAISE EXCEPTION 'training card count preference contract missing';
  END IF;
END $$;
