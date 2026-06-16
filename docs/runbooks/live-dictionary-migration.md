# Live Dictionary Migration Runbook

Use this runbook before applying the dictionary/list/card/user-dictionary
migration chain to the live Supabase project. The live project currently has
test users only, but user progress must still be preserved.

## Current Readiness

Status: `not ready for blind live apply`.

The branch is close, but live migration must be run as a gated operation because
migrations `052_drop_legacy_user_word_status.sql` and
`054_drop_legacy_word_rpcs.sql` are destructive. Do not apply those migrations
until the parity gate below passes on the live database.

Migration `066_harden_live_migration_blockers.sql` closes the senior-review
security/read-only blockers:

- removes PUBLIC/anon execute grants from sensitive scope/search/list RPCs,
- keeps user-dictionary validation helpers internal to wrapper RPCs,
- makes `get_active_training_scope(uuid,text)` read-only while preserving its
  `STABLE` volatility.

## Required Inputs

- Confirm the exact live branch/commit being deployed.
- Confirm Supabase project id and database URL.
- Confirm a recent Supabase backup exists and can be restored.
- Confirm app deploy rollback target.
- Confirm a short write freeze for test users during DB migration.

## Preflight

Run against live before applying migrations.

```sql
select now() as checked_at, current_database() as database_name;

select count(*) as auth_users from auth.users;
select count(*) as user_settings from public.user_settings;
select count(*) as legacy_user_word_status
from public.user_word_status;
select count(*) as user_card_status
from public.user_card_status;
select count(*) as user_review_log
from public.user_review_log;
select count(*) as user_word_lists
from public.user_word_lists;
select count(*) as user_word_list_items
from public.user_word_list_items;

select user_id, word_id, mode, count(*) as duplicates
from public.user_word_status
group by user_id, word_id, mode
having count(*) > 1;

select user_id, entry_id, card_type_id, count(*) as duplicates
from public.user_card_status
group by user_id, entry_id, card_type_id
having count(*) > 1;

select count(*) as orphan_user_word_list_items
from public.user_word_list_items item
left join public.user_word_lists list on list.id = item.list_id
where list.id is null;

select count(*) as missing_word_entries_for_list_items
from public.user_word_list_items item
left join public.word_entries entry on entry.id = item.word_id
where entry.id is null;
```

Expected result: duplicate/orphan/missing-entry result sets are empty or
explicitly accepted before continuing.

## Migration Sequence

1. Put the app into a short maintenance/write-freeze window.
2. Take a Supabase backup immediately before migration.
3. Apply non-destructive migrations up to and including
   `051_remove_word_status_sync_bridge.sql`.
4. Run the mandatory parity gate:

   ```bash
   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
     -f db/scripts/check_user_card_status_parity_before_drop.sql
   ```

5. If the parity gate fails, stop. Do not apply `052` or later. Restore or
   inspect while both legacy and new state tables still exist.
6. Take a second backup after the parity gate passes and before the destructive
   drops.
7. Apply migrations `052` through the latest migration, including
   `066_harden_live_migration_blockers.sql`.
8. Deploy the matching `apps/ui` build.
9. Run postflight validation before reopening writes.

If the deployment tool cannot pause between `051` and `052`, split the live
deployment into two migration batches.

## Postflight

Run the local contract probe equivalent against live:

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
  -f db/scripts/local_supabase_probe.sql
```

Run this grant audit after `066`:

```sql
with blocked(signature) as (
  values
    ('public.get_active_word_list(uuid)'::regprocedure),
    ('public.get_available_word_lists(uuid,text,text)'::regprocedure),
    ('public.update_active_word_list(uuid,uuid,text)'::regprocedure),
    ('public.get_available_learning_languages(uuid)'::regprocedure),
    ('public.get_available_dictionary_sources(uuid,text)'::regprocedure),
    ('public.get_active_training_scope(uuid,text)'::regprocedure),
    ('public.update_active_training_scope(uuid,text,uuid,text,text,text,text[],int)'::regprocedure),
    ('public.search_word_entries_gated(text,text,boolean,boolean,boolean,int,int,text,uuid[])'::regprocedure),
    ('public.assert_editable_user_dictionary(uuid,uuid)'::regprocedure),
    ('public.validate_user_entry_v1_payload(jsonb,text)'::regprocedure)
)
select signature::text, acl.grantee::regrole, acl.privilege_type
from blocked
join pg_proc p on p.oid = blocked.signature
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
where acl.privilege_type = 'EXECUTE'
  and (
    acl.grantee = 0
    or acl.grantee = 'anon'::regrole
    or (
      blocked.signature in (
        'public.assert_editable_user_dictionary(uuid,uuid)'::regprocedure,
        'public.validate_user_entry_v1_payload(jsonb,text)'::regprocedure
      )
      and acl.grantee = 'authenticated'::regrole
    )
  );
```

Expected result: zero rows.

Verify `get_active_training_scope` remains read-only:

```sql
select p.provolatile,
       position('UPDATE user_training_scopes' in pg_get_functiondef(p.oid)) as update_position
from pg_proc p
where p.oid = 'public.get_active_training_scope(uuid,text)'::regprocedure;
```

Expected result: `provolatile = 's'` and `update_position = 0`.

Run app checks:

```bash
cd apps/ui
npm run lint
npm run typecheck
npm test
```

Smoke the live UI with a test user:

- login,
- search a trusted dictionary entry,
- copy it into the user's dictionary,
- create a private entry,
- add the private entry to a user list,
- train that entry once,
- confirm the list/training scope did not silently switch to the dictionary
  source.

## Rollback Points

- Before `052`: restore from the first backup or fix while both legacy and new
  state still exist.
- After `052`: restore from the second backup if postflight detects data loss.
  Do not attempt manual reconstruction of dropped legacy state unless a backup
  restore has been ruled out.
- App rollback: redeploy the previous app build only if the database is also at
  a compatible migration point.

## Stop Conditions

Stop and do not reopen writes if any of these fail:

- `check_user_card_status_parity_before_drop.sql`,
- `local_supabase_probe.sql`,
- grant audit returns rows,
- `get_active_training_scope` contains an update while marked `STABLE`,
- user-dictionary create/copy/train smoke fails for a test user.
