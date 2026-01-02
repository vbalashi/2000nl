-- Fix Supabase Auth signup failures caused by trigger permissions.
--
-- Context:
-- We seed `public.user_settings` via an AFTER INSERT trigger on `auth.users`.
-- Trigger functions run as the role performing the INSERT into `auth.users`
-- (e.g. Supabase Auth admin role), which typically does NOT have privileges
-- to write to `public.*` tables. That causes GoTrue to return:
--   "Database error saving new user"
--
-- Solution:
-- Make the trigger function SECURITY DEFINER and pin search_path to public.
-- This matches Supabase's recommended pattern for auth->public triggers.

create or replace function public.set_default_user_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.user_settings (user_id)
    values (new.id)
    on conflict do nothing;
    return new;
end;
$$;

-- Ensure the trigger exists (idempotent)
do $$
begin
    if not exists (
        select 1 from pg_trigger where tgname = 'trg_user_settings_seed'
    ) then
        create trigger trg_user_settings_seed
        after insert on auth.users
        for each row execute function public.set_default_user_settings();
    end if;
end $$;

