-- Allow multiple meaning entries per headword by keying on meaning_id

alter table word_entries
    add column if not exists meaning_id int default 1;

update word_entries
set meaning_id = coalesce(meaning_id, 1);

alter table word_entries
    alter column meaning_id set not null;

drop index if exists word_entries_language_headword_idx;

create unique index if not exists word_entries_language_headword_meaning_idx
    on word_entries(language_code, headword, meaning_id);
