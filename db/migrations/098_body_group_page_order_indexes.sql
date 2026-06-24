-- Page-order indexes for common-term grouped body search.
-- They let Examples/Definitions scan in cursor order and stop at LIMIT + 1
-- instead of collecting and sorting every FTS hit for terms such as "de".

CREATE INDEX IF NOT EXISTS dictionary_search_fields_examples_page_order_v2_idx
    ON dictionary_search_fields (
        language_code,
        meaning_ordinal,
        item_ordinal,
        entry_id,
        source_path
    )
    WHERE extraction_version >= 2
      AND field_group IN ('example', 'idiom');

CREATE INDEX IF NOT EXISTS dictionary_search_fields_definitions_page_order_v2_idx
    ON dictionary_search_fields (
        language_code,
        meaning_ordinal,
        item_ordinal,
        entry_id,
        source_path
    )
    WHERE extraction_version >= 2
      AND field_group IN ('definition', 'context', 'note');

ANALYZE dictionary_search_fields;
