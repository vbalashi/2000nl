-- Stop maintaining user_word_status as a compatibility mirror.
--
-- The active scheduler, review, lookup, gated-list, history, and stats paths now
-- read/write user_card_status directly. Keep the old table for historical
-- migration safety, but do not synchronize new card state into it.

DROP TRIGGER IF EXISTS user_word_status_sync_card_status ON user_word_status;
DROP TRIGGER IF EXISTS user_card_status_sync_word_status ON user_card_status;

DROP FUNCTION IF EXISTS private.sync_user_word_status_to_card_status();
DROP FUNCTION IF EXISTS private.sync_user_card_status_to_word_status();
