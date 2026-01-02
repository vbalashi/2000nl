-- Create user_word_status table for tracking SM2 progress
create table if not exists user_word_status (
    user_id uuid not null references auth.users(id) on delete cascade,
    word_id uuid not null references word_entries(id) on delete cascade,
    mode text not null, -- 'word-to-definition' or 'definition-to-word'
    
    -- SM2 Algorithm Fields
    sm2_n int default 0,          -- Number of repetitions
    sm2_ef float default 2.5,     -- E-Factor (easiness)
    sm2_interval int default 0,   -- Interval in days
    next_review_at timestamptz default now(), -- When it should be reviewed next
    
    -- Interaction Stats
    click_count int default 0,    -- How often user clicked definition (implied "forgot")
    seen_count int default 0,     -- How many times shown (passive)
    success_count int default 0,  -- How many times "remembered"
    
    last_seen_at timestamptz default now(),
    last_result text,             -- 'success', 'fail', 'freeze', 'hide'
    
    hidden boolean default false,
    frozen_until timestamptz,
    
    primary key (user_id, word_id, mode)
);

-- Index for finding overdue words quickly
create index if not exists user_word_status_next_review_idx
    on user_word_status(user_id, mode, next_review_at);

-- Index for finding frequently clicked words
create index if not exists user_word_status_clicks_idx
    on user_word_status(user_id, mode, click_count desc);

-- Create user_events table for history log
create table if not exists user_events (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    word_id uuid references word_entries(id) on delete set null,
    mode text not null,
    event_type text not null, -- 'review_success', 'review_fail', 'definition_click', 'freeze', 'hide'
    created_at timestamptz default now(),
    meta jsonb -- Extra data if needed
);

-- Index for stats
create index if not exists user_events_user_date_idx
    on user_events(user_id, created_at);
