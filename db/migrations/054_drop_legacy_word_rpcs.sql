-- Drop legacy word-named training mutation RPCs after moving runtime code to
-- card-oriented actions.

DROP FUNCTION IF EXISTS record_word_view(uuid, uuid, text);
DROP FUNCTION IF EXISTS start_learning_card(uuid, uuid, text);
DROP FUNCTION IF EXISTS handle_review(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS handle_review(uuid, uuid, text, text, uuid);
DROP FUNCTION IF EXISTS handle_click(uuid, uuid, text);
