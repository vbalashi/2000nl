BEGIN;
-- Keep ordinary preferences editable, but tier authority belongs to the server.
-- Table-level privileges would override any column-level restriction.
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON public.user_settings FROM anon,authenticated;
DO $$
DECLARE columns text;
BEGIN
 SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO columns
 FROM pg_attribute WHERE attrelid='public.user_settings'::regclass AND attnum>0 AND NOT attisdropped
  AND attname<>'subscription_tier';
 EXECUTE 'GRANT INSERT ('||columns||'), UPDATE ('||columns||') ON public.user_settings TO authenticated';
END;
$$;
-- Defence in depth for indirect writes through an existing SECURITY DEFINER
-- routine; the request role survives that routine's effective-user change.
CREATE FUNCTION private.guard_subscription_tier_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF current_setting('role',true) IN ('anon','authenticated') AND
  ((TG_OP='DELETE' AND EXISTS(SELECT 1 FROM auth.users WHERE id=OLD.user_id))
   OR (TG_OP='INSERT' AND NEW.subscription_tier IS DISTINCT FROM 'free')
   OR (TG_OP='UPDATE' AND NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier)) THEN
  RAISE EXCEPTION 'subscription_tier_server_owned' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_subscription_tier_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER subscription_tier_server_owned BEFORE INSERT OR UPDATE OR DELETE ON public.user_settings
 FOR EACH ROW EXECUTE FUNCTION private.guard_subscription_tier_v1();
NOTIFY pgrst,'reload schema';
COMMIT;
