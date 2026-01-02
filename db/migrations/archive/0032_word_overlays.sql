-- Word overlays: shared translations + per-user notes

-- 1) Shared translations per word entry + target language
create table if not exists word_entry_translations (
    id uuid primary key default gen_random_uuid(),
    word_entry_id uuid not null references word_entries(id) on delete cascade,
    target_lang text not null,
    provider text not null default 'deepl',
    status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
    overlay jsonb,
    source_fingerprint text,
    error_message text,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),

    unique (word_entry_id, target_lang, provider)
);

create index if not exists word_entry_translations_lookup_idx
    on word_entry_translations(word_entry_id, target_lang);

-- Enable RLS and allow read access (writes via service role only)
alter table if exists word_entry_translations enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'word_entry_translations'
          and policyname = 'select_word_entry_translations'
    ) then
        create policy select_word_entry_translations on word_entry_translations
            for select
            using (true);
    end if;
end $$;

-- 2) Per-user notes per word entry (single freeform text)
create table if not exists user_word_notes (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    word_entry_id uuid not null references word_entries(id) on delete cascade,
    notes text not null default '',
    created_at timestamptz default now(),
    updated_at timestamptz default now(),

    unique (user_id, word_entry_id)
);

create index if not exists user_word_notes_user_idx
    on user_word_notes(user_id, word_entry_id);

alter table if exists user_word_notes enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'user_word_notes'
          and policyname = 'select_own_user_word_notes'
    ) then
        create policy select_own_user_word_notes on user_word_notes
            for select
            using (auth.uid() = user_id);
    end if;

    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'user_word_notes'
          and policyname = 'insert_own_user_word_notes'
    ) then
        create policy insert_own_user_word_notes on user_word_notes
            for insert
            with check (auth.uid() = user_id);
    end if;

    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'user_word_notes'
          and policyname = 'update_own_user_word_notes'
    ) then
        create policy update_own_user_word_notes on user_word_notes
            for update
            using (auth.uid() = user_id)
            with check (auth.uid() = user_id);
    end if;

    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'user_word_notes'
          and policyname = 'delete_own_user_word_notes'
    ) then
        create policy delete_own_user_word_notes on user_word_notes
            for delete
            using (auth.uid() = user_id);
    end if;
end $$;

-- 3) User translation language preference
alter table if exists user_settings
    add column if not exists translation_lang text default null;
