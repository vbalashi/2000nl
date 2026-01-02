-- Drop old function overloads that conflict with list-aware versions
-- PostgREST error PGRST203 occurs when it can't disambiguate between overloaded functions.

-- Drop the old 3-param get_next_word (keeping the 5-param list-aware version from 0016)
drop function if exists get_next_word(uuid, text, uuid[]);

-- Drop the old 2-param get_training_stats (keeping the 4-param list-aware version from 0016)
drop function if exists get_training_stats(uuid, text);
