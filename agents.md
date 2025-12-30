# Agent Notes

## Running psql against Supabase

1. Obtain your Supabase connection string from the project settings (Database > Connection string > psql).
2. Export it as an environment variable (or paste directly when prompted):
   ```
   export SUPABASE_DB_URL="postgresql://USER:PASSWORD@HOST:PORT/postgres?sslmode=require"
   ```
3. Connect with `psql`:
   ```
   psql "$SUPABASE_DB_URL"
   ```
4. Quick validation queries:
   - Count entries: `select count(*) from word_entries;`
   - Inspect a headword: `select headword, part_of_speech, is_nt2_2000 from word_entries limit 5;`
   - Lists: `select name, count(*) from word_list_items join word_lists using (id) group by name;`
   - Progress: `select count(*) from user_events;`

Tip: if using a local `.env.local`, you can store `SUPABASE_DB_URL` there and run `psql "$(grep SUPABASE_DB_URL .env.local | cut -d= -f2-)"`.

## FSRS reference
- FSRS-6 is implemented in Postgres functions (`db/migrations/0010+`), with RPCs `handle_review`, `handle_click`, and `get_next_word`.
- Defaults: 10 new cards/day, unlimited reviews; 4 grades (again/hard/good/easy) plus freeze/hide.
- Clicks are treated as lapses (grade=again).
