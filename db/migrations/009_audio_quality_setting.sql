-- Add audio quality setting to user_settings (free/premium)
-- Idempotent: safe to run multiple times.

alter table if exists user_settings
    add column if not exists audio_quality text;

-- Backfill existing rows (PG defaults are not guaranteed to appear on old tuples).
update user_settings
set audio_quality = 'free'
where audio_quality is null;

alter table if exists user_settings
    alter column audio_quality set default 'free';

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.user_settings'::regclass
          and conname = 'user_settings_audio_quality_check'
    ) then
        alter table public.user_settings
            add constraint user_settings_audio_quality_check
            check (audio_quality in ('free', 'premium'));
    end if;
end $$;
