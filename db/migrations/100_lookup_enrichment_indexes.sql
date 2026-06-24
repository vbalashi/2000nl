-- Indexes for authenticated lookup enrichment reads used by external clients.

CREATE INDEX IF NOT EXISTS word_list_items_word_list_idx
    ON word_list_items(word_id, list_id);

CREATE INDEX IF NOT EXISTS user_word_list_items_word_list_idx
    ON user_word_list_items(word_id, list_id);

CREATE INDEX IF NOT EXISTS word_entry_translations_entry_lang_provider_idx
    ON word_entry_translations(word_entry_id, target_lang, provider);

ANALYZE word_list_items;
ANALYZE user_word_list_items;
ANALYZE word_entry_translations;
