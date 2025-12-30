-- Rename misleading column frequency_rank to vandale_id
ALTER TABLE word_entries 
RENAME COLUMN frequency_rank TO vandale_id;
