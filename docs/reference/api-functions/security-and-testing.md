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

- Current fresh deploys use consolidated migrations in `db/migrations/001_core_schema.sql` through `007_review_idempotency.sql`.
- `005_security.sql` owns current RLS policies.
- `007_review_idempotency.sql` adds `turn_id` handling to `handle_review`.
- Historical migration notes in `reports/` and `db/migrations/archive/` are reference snapshots, not the fresh-deploy path.

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
  p_result: 'success',
  p_turn_id: crypto.randomUUID()
});
```
