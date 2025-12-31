-- Enable translations by default for new accounts.
--
-- Previously, `public.user_settings` is seeded on signup with only `user_id`,
-- and `translation_lang` defaulted to NULL, which effectively disabled
-- translation UI for newly created users.
--
-- Going forward:
-- - Default translation_lang is English ("en")
-- - "Off" is represented explicitly by the UI as the sentinel value 'off'
--   (not by NULL), so NULL can be safely interpreted as legacy/unset.

alter table if exists public.user_settings
  alter column translation_lang set default 'en';

update public.user_settings
set translation_lang = 'en'
where translation_lang is null;

