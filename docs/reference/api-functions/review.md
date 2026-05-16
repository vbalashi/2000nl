# API Functions: Review

## `handle_review`

Record a graded review.

```sql
handle_review(
    p_user_id uuid,
    p_word_id uuid,
    p_mode text,
    p_result text
) RETURNS void
```

Side effects:
- Updates `user_word_status`
- Inserts into `user_review_log`
- Inserts into `user_events`

Example:
```javascript
await supabase.rpc('handle_review', {
  p_user_id: user.id,
  p_word_id: wordId,
  p_mode: 'word-to-definition',
  p_result: 'success'
});
```

## `handle_click`

Record a reveal click that counts as a lapse in FSRS.

```sql
handle_click(
    p_user_id uuid,
    p_word_id uuid,
    p_mode text
) RETURNS void
```

Side effects:
- Updates `user_word_status`
- Inserts into `user_review_log`
- Inserts into `user_events`
- Increments click count

Example:
```javascript
await supabase.rpc('handle_click', {
  p_user_id: user.id,
  p_word_id: wordId,
  p_mode: 'word-to-definition'
});
```
