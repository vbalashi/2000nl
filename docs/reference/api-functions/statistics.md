# API Functions: Statistics

## `get_detailed_training_stats`

Get detailed training statistics for the current session footer.

```sql
get_detailed_training_stats(
    p_user_id uuid,
    p_modes text[] DEFAULT NULL,
    p_list_id uuid DEFAULT NULL,
    p_list_type text DEFAULT 'curated'
) RETURNS jsonb
```

The JSON projection distinguishes the historical facts used by the footer and
diagnostics:

- `newWordsToday` / `newCardsToday`: entries and exact entry + card-type pairs
  introduced today by an accepted `Learn` action, with a first new review as a
  compatibility fallback;
- `learningStartedToday`: exact entry + card-type pairs with an accepted
  `Learn` action today;
- `graduatedNewWordsToday`: introduced entries whose new review has reached an
  interday interval. This is separate from the New counter and is not inferred
  from an enrollment-only event.

The projection is read-only. It does not create an FSRS grade or change queue
selection.

## `get_scenario_word_stats`

Get FSRS stats for a specific word in a scenario.

```sql
get_scenario_word_stats(
    p_user_id uuid,
    p_word_id uuid,
    p_scenario_id text
) RETURNS jsonb
```

## `get_scenario_stats`

Get aggregate scenario stats.

```sql
get_scenario_stats(
    p_user_id uuid,
    p_scenario_id text,
    p_list_id uuid DEFAULT NULL,
    p_list_type text DEFAULT 'curated'
) RETURNS jsonb
```

## `get_training_scenarios`

Get static scenario definitions.

```sql
get_training_scenarios() RETURNS SETOF jsonb
```

This function returns static data and does not take `p_user_id`.
