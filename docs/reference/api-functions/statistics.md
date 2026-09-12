# API Functions: Statistics

## `get_detailed_training_stats`

Get detailed training statistics for the current session footer.

```sql
get_detailed_training_stats(
    p_user_id uuid,
    p_modes text[],
    p_list_id uuid,
    p_list_type text,
    p_timezone text
) RETURNS jsonb
```

The four-argument compatibility form retains defaults for `p_modes`,
`p_list_id`, and `p_list_type` and derives the timezone from the learner's
settings.

The JSON projection distinguishes the historical facts used by the footer and
diagnostics:

- `newWordsToday` / `newCardsToday`: entries and exact entry + card-type pairs
  introduced during the learner's current local study day (04:00–04:00) by an
  accepted `Learn` action, with a first new review as a compatibility fallback;
- `learningStartedToday`: exact entry + card-type pairs with an accepted
  `Learn` action during the current local study day;
- `graduatedNewWordsToday`: introduced entries whose new review has reached an
  interday interval. This is separate from the New counter and is not inferred
  from an enrollment-only event.

The five-argument form accepts the browser-resolved IANA timezone, such as
`Europe/Amsterdam`. The four-argument compatibility form uses the timezone
stored for the learner and falls back to UTC. The study-day boundary is for
counter attribution only; it is not a daily quota and does not change FSRS
`next_review_at` instants.

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
