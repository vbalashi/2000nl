-- Drop legacy word-oriented card state storage.
--
-- Migration 042 backfilled user_card_status from user_word_status before the
-- runtime switched over. Active RPCs now read/write user_card_status directly.

DROP TABLE IF EXISTS user_word_status CASCADE;
