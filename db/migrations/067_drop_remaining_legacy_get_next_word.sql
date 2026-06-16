-- Drop remaining legacy scheduler overloads found during live phase2 postflight.
-- Runtime code uses get_next_card; get_next_word must not remain exposed.

DROP FUNCTION IF EXISTS get_next_word(uuid, text, uuid[], uuid, text, text, text);
DROP FUNCTION IF EXISTS get_next_word(uuid, text[], uuid[], uuid, text, text);
