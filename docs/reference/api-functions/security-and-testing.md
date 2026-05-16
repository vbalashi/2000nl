# API Functions: Security And Testing

## Internal Functions

Internal helpers should not live in the public PostgREST surface.

Example:
- `private.get_last_review_debug`

## Authorization Pattern

Public user-bound functions should follow this shape:

```sql
IF p_user_id != (select auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: user_id does not match authenticated user';
END IF;
```

## Functions Without `user_id`

Functions that do not accept `p_user_id` must either:
- use `auth.uid()` internally, or
- return static data only

## Trigger Functions

Trigger functions are not part of the public RPC contract.

Example:
- `set_default_user_settings`

## Migration History

- 2026-01-25 (Migration 011): added auth checks to key public functions
- 2026-01-25 (Migration 012): created `private` schema and moved debug helpers there

## Testing API Calls

Authenticated request example:

```javascript
const supabase = createClient(url, key);
const { data, error } = await supabase.rpc('get_next_word', {
  p_user_id: user.id,
  p_modes: ['word-to-definition']
});
```

Authorization failure example:

```javascript
await supabase.rpc('handle_review', {
  p_user_id: '<some-other-user-uuid>',
  p_word_id: wordId,
  p_mode: 'word-to-definition',
  p_result: 'success'
});
```
