-- FSRS-6 schema additions
-- - Add FSRS state columns to user_word_status (keeps SM2 columns for fallback)
-- - Add per-review log for auditing and analytics
-- - Add user_settings for daily limits and feature flags

-- 1) Extend user_word_status with FSRS fields
alter table if exists user_word_status
    add column if not exists fsrs_stability numeric,            -- S
    add column if not exists fsrs_difficulty numeric,           -- D (1-10)
    add column if not exists fsrs_reps int default 0,           -- total reviews
    add column if not exists fsrs_lapses int default 0,         -- total lapses (grade=1)
    add column if not exists fsrs_last_grade smallint,          -- last grade 1-4
    add column if not exists fsrs_last_interval numeric,        -- last scheduled interval (days)
    add column if not exists fsrs_target_retention numeric default 0.9, -- desired retention
    add column if not exists fsrs_params_version text default 'fsrs-6-default', -- which parameter set used
    add column if not exists fsrs_enabled boolean default false; -- feature flag per row

-- Index to continue to support fast due queries (reuses next_review_at)
create index if not exists user_word_status_fsrs_next_idx
    on user_word_status(user_id, mode, next_review_at);

-- 2) Review log to capture each scheduling decision
create table if not exists user_review_log (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    word_id uuid not null references word_entries(id) on delete cascade,
    mode text not null,
    grade smallint not null,              -- 1=again, 2=hard, 3=good, 4=easy
    review_type text not null,            -- 'new' | 'review' | 'click'
    scheduled_at timestamptz,             -- when it was due
    reviewed_at timestamptz default now(),
    response_ms int,
    stability_before numeric,
    difficulty_before numeric,
    stability_after numeric,
    difficulty_after numeric,
    interval_after numeric,               -- scheduled interval (days) after review
    params_version text default 'fsrs-6-default',
    metadata jsonb
);

create index if not exists user_review_log_user_idx
    on user_review_log(user_id, mode, reviewed_at desc);

-- 3) User settings (daily limits + FSRS rollout)
create table if not exists user_settings (
    user_id uuid primary key references auth.users(id) on delete cascade,
    daily_new_limit int default 10,
    daily_review_limit int default 40,
    mix_mode text default 'mixed',            -- 'mixed' | 'new_only' | 'review_only'
    target_retention numeric default 0.9,
    use_fsrs boolean default false,
    updated_at timestamptz default now()
);

create or replace function set_default_user_settings()
returns trigger
language plpgsql
as $$
begin
    insert into user_settings (user_id)
    values (new.id)
    on conflict do nothing;
    return new;
end;
$$;

-- Automatically seed settings for new auth users
do $$
begin
    if not exists (
        select 1 from pg_trigger where tgname = 'trg_user_settings_seed'
    ) then
        create trigger trg_user_settings_seed
        after insert on auth.users
        for each row execute function set_default_user_settings();
    end if;
end $$;
