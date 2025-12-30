• Connection & schema checklist

  - Local Postgres (same as your current Docker container):
      - Host: localhost
      - Port: 5432
      - Database: dictionary
      - User: postgres
      - Password: postgres
      - SSL: disabled
      - Once schema is applied (migrations/0001_create_schema.sql), exposed tables are languages, word_entries, word_lists, word_list_items. word_entries.raw holds the original
        JSON.
  - Connection & auth
      - Use the same credentials when switching to Supabase—the hosted DATABASE_URL you get from Supabase replaces the local connection string.
      - The importer and tests read DATABASE_URL from the environment (scripts/import_words.py and tests). On the frontend side, you’ll point http clients (REST/GraphQL) at
        Supabase’s auto-generated APIs once the data lands there.
  - Schema pointers for the UI
      - word_entries columns you can use directly: id, language_code, headword, part_of_speech, gender, is_nt2_2000, frequency_rank, raw, created_at.
      - All other per-entry data (meanings, audio links, idioms, conjugation tables, derivations, etc.) lives inside raw (JSON). You can query specific fields in SQL with
        raw->>'field' or raw->'meanings'. If the UI needs filtering/searching on nested fields, we can add generated columns or indexes later.
      - word_lists/word_list_items expose curated lists (like VanDale 2k). Join word_entries with word_list_items by word_id to get list membership rank.
  - Steps for your frontend engineer
      1. Run the migrations locally (psql -f migrations/0001_create_schema.sql).
      2. Run the importer (DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dictionary python scripts/import_words.py --data-dir data/words_content). This is idempotent;
         re-running just updates rows.
      3. Connect the UI to Postgres via Supabase by pointing it at the hosted DATABASE_URL. The importer can be re-run against Supabase once the schema exists there.
      4. For rapid prototyping, query word_entries with raw->> accessors; we can add normalized columns later once you know which fields need filtering.
