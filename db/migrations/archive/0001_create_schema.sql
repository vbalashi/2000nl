create extension if not exists pgcrypto;

create table if not exists languages (
    code text primary key,
    name text not null
);

create table if not exists word_entries (
    id uuid primary key default gen_random_uuid(),
    language_code text not null references languages(code),
    headword text not null,
    part_of_speech text,
    gender text,
    is_nt2_2000 boolean default false,
    vandale_id int,
    raw jsonb not null,
    created_at timestamptz default now()
);

create unique index if not exists word_entries_language_headword_idx
    on word_entries(language_code, headword);

create table if not exists word_lists (
    id uuid primary key default gen_random_uuid(),
    language_code text not null references languages(code),
    slug text not null,
    name text not null,
    description text,
    is_primary boolean default false,
    unique(language_code, slug)
);

create table if not exists word_list_items (
    list_id uuid not null references word_lists(id) on delete cascade,
    word_id uuid not null references word_entries(id) on delete cascade,
    rank int,
    primary key (list_id, word_id)
);
