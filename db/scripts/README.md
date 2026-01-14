# Database Scripts

## Connection

Use `psql_supabase.sh` to connect to the Supabase database:

```bash
./db/scripts/psql_supabase.sh
```

Requires `SUPABASE_DB_URL` or `DATABASE_URL` environment variable.

---

## SRS History Analysis

**Script:** `srs_history.sh`
**Purpose:** Debug SRS queue issues by analyzing user learning history

### Usage

```bash
# Analyze all reviews for a user
./db/scripts/srs_history.sh <user_id>

# Analyze specific word for a user
./db/scripts/srs_history.sh <user_id> <word_id>
```

### Example

```bash
./db/scripts/srs_history.sh abc-123-def-456
./db/scripts/srs_history.sh abc-123-def-456 789
```

### Output

The script shows chronological review history including:
- Card appearances with timestamps
- User response grades (1=again, 2=hard, 3=good, 4=easy)
- Interval values before and after each review
- Anomaly flag for repeated cards despite good/easy answers
- Word headword or form text

### Use Cases

- Debug issue 2000NL-002 (words repeating after "goed" answer)
- Analyze FSRS interval progression
- Identify queue anomalies
- Understand user learning patterns

### Database Tables Used

- `user_review_log`: Review history with grades and intervals
- `user_word_status`: Current word state and FSRS fields
- `word_entries.headword`: Word text lookup
- `word_forms.form`: Word form variations

**Note:** The script filters out `review_type='click'` events (sidebar word lookups) to focus on actual reviews.

---

## Development

When adding new scripts:
1. Add connection logic using `SUPABASE_DB_URL` or `DATABASE_URL`
2. Document usage in this README
3. Update `/docs/app-behavior.md` with the new tool
