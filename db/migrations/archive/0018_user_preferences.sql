-- Add user preference columns to user_settings
alter table if exists user_settings
    add column if not exists theme_preference text default 'system' check (theme_preference in ('light', 'dark', 'system')),
    add column if not exists training_mode text default 'word-to-definition' check (training_mode in ('word-to-definition', 'definition-to-word')),
    add column if not exists language_code text default 'nl';
