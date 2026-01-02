create table if not exists word_forms (
    language_code text not null references languages(code),
    form text not null,
    word_id uuid not null references word_entries(id) on delete cascade,
    headword text not null,
    created_at timestamptz default now(),
    primary key (language_code, form, word_id)
);

create index if not exists word_forms_form_idx
    on word_forms(form);

create index if not exists word_forms_language_form_idx
    on word_forms(language_code, form);
