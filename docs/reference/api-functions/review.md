# API Functions: Review

## `handle_card_review`

Record a graded review for one card identity.

```sql
handle_card_review(
    p_user_id uuid,
    p_entry_id uuid,
    p_card_type_id text,
    p_result text,
    p_turn_id uuid DEFAULT NULL
) RETURNS void
```

`p_turn_id` is a client-generated UUID for the presented card turn. When it is non-null, duplicate submissions with the same value are treated as no-ops.

Side effects:
- Updates `user_card_status`
- Inserts into `user_review_log`
- Inserts into `user_events`

Example:
```javascript
await supabase.rpc('handle_card_review', {
  p_user_id: user.id,
  p_entry_id: entryId,
  p_card_type_id: 'word-to-definition',
  p_result: 'success',
  p_turn_id: turnId
});
```

## `record_card_view`

Record that a card was presented or viewed without changing FSRS review state.

```sql
record_card_view(
    p_user_id uuid,
    p_entry_id uuid,
    p_card_type_id text
) RETURNS void
```

Side effects:
- Upserts `user_card_status`
- Updates `last_seen_at`

Ordinary dictionary lookup, external API lookup, hover, and passive read events must stay read-only unless the request explicitly calls a mutation action.

## `start_learning_entry_card`

Explicitly enable learning for one `entry_id + card_type_id` without writing a review-log row.

```sql
start_learning_entry_card(
    p_user_id uuid,
    p_entry_id uuid,
    p_card_type_id text
) RETURNS void
```
