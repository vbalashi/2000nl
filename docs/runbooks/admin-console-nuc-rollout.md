# Admin console rollout and rollback

This is a preparation checklist for issue #480. It does not authorize a
production rollout, database migration, DNS change, or operator provisioning.
The intended route is `https://2000.dilum.io/admin` on the existing UI
container and deployment path.

## Before proposing a rollout

1. Owner decisions are recorded in #480: use the existing Supabase project
   and configured Google provider, no MFA, collect IP and User-Agent, and
   retain audit events for one year.
2. Review the exact implementation and PR, including authorization tests for
   unauthenticated, learner-only, inactive, and insufficient-permission calls.
3. If operator registry or audit storage needs a migration, check ownership and
   the current DB manifest first. Assign the migration to an issue, add its
   exact checksum and postflight contract, run the DB contract tests, and
   confirm compatibility with the prior UI image. Do not edit an existing
   migration or bypass an explicit rollout hold.
4. Read the current NUC deployment configuration through an authorized,
   read-only channel. Confirm the existing reverse-proxy behavior and required
   runtime environment variables without displaying or copying secret values.
5. Keep the app on the current `2000.dilum.io` domain and existing UI service.
   Add no DNS record or second application container for this slice.

## Deployment behavior

`.github/workflows/deploy-nuc.yml` runs on pushes to `main` that change
application/runtime paths. Merging a relevant PR can therefore initiate the
deployment; PR review must treat merge as the rollout boundary.

The workflow validates the checked-in DB manifest, checks rollout status,
builds the new UI while the existing container is running, applies only the
manifest-pinned forward contract, switches the UI image, and verifies deep
health for the exact commit. The base repository contract was DB 163 under
#485. This change appends migration 164 and updates the contract to
`2000nl-db-164`; the issue-specific postflight checks access controls, trigger
behavior and audit-retention scheduling. Recheck the manifest and hold state
from the reviewed PR head before any future deployment; do not rely on this
note as live-server state.

Compose supplies `ADMIN_SITE_URL=https://2000.dilum.io` by default (an explicit
host environment override is supported). Ensure
`https://2000.dilum.io/api/admin/auth/callback` is present in the Supabase Auth
redirect URL allowlist, preserving existing learner callback URLs. The Google
OAuth provider's callback remains Supabase's own `/auth/v1/callback` URL.
Keep the project's existing server-only Supabase URL and anon key, plus its
service-role/secret key in server runtime secrets. Never place privileged credentials in
`NEXT_PUBLIC_*` settings, browser payloads, logs, or issue comments. Collect
IP and User-Agent context under the confirmed policy. Verify the trusted
proxy/IP source and retention cleanup before rollout.

## Operator bootstrap and recovery

This first iteration uses an allowlist, not public operator registration.
Before rollout, an owner selects a Google identity (an existing learner
identity is supported) and adds its normalized email with only the required
permissions. For an existing user, bind the verified Auth user ID at bootstrap:

```sql
INSERT INTO public.admin_operators (email, user_id, is_active, permissions)
SELECT lower(email), id, true, ARRAY['dictionaries.read', 'audit.read']
FROM auth.users
WHERE lower(email) = 'operator@example.com' AND email_confirmed_at IS NOT NULL;
```

Verify exactly one row was inserted. For a new identity, allowlist its email
before the first Google sign-in:

```sql
INSERT INTO public.admin_operators (email, is_active, permissions)
VALUES ('operator@example.com', true, ARRAY['dictionaries.read', 'audit.read']);
```

Use only `dictionaries.read` or `audit.read` as needed. On first successful
Google callback, the application binds the Supabase Auth user ID to the row;
the Auth trigger does not create learner settings for an active allowlisted
operator. Existing learner settings and progress remain intact. Verify that a
learner-only session cannot access the admin API, even for the same Auth user,
and that sign-out in either surface preserves the other surface’s session.

For urgent access removal, set `is_active = false` and revoke remaining rows
in `admin_operator_sessions` for that Auth user ID. Protected requests enforce
this immediately. To restore access, confirm the identity and minimum
permissions, reactivate the row, and have the operator sign in again. If
replacing an identity, prepare a new Google identity and update the allowlisted
email after disabling the old row. Review all recovery SQL against the intended
database first. Provision only the identity explicitly authorized by the
owner, after the reviewed migration is deployed. Do not create a duplicate Auth user or reset
existing learner credentials.

## Audit retention

`admin_audit_events` stores application-observed events, request correlation
IDs, and optional IP/User-Agent context. The scheduled pg_cron job
`admin-audit-retention-365-days` deletes rows older than 365 days each night.
Confirm the job is active after migration and periodically inspect its last
run and status in `cron.job_run_details`. Repair a missing or failing job
through the reviewed DB contract. Do not trim other tables or shorten
retention without an owner decision.

Caddy replaces untrusted forwarding headers at public ingress. Verify any
CDN/proxy chain before rollout; otherwise `client_ip` may represent the
immediate proxy. The application bounds User-Agent to 1024 characters,
validates IP syntax, and stores neither tokens nor request bodies. Required
audit writes fail closed.

## Smoke and rollback

After the authorized deployment, verify deep health reports the exact deployed
commit and a compatible database contract. Then use the approved operator QA
identity to check sign-in, registry read, metadata read, preserved return
state, journal read, direct API denial, session isolation/revocation, and
sign-out. Do not mutate learner records for this smoke.

The existing deploy workflow restores the exact previous UI image if the new
container fails health after switching. It deliberately leaves forward DB
migrations in place. Do not reverse an admin migration ad hoc; follow its
owning issue's reviewed recovery plan. If there was no previous image, the
workflow stops the incompatible new UI and requires operator recovery.

Do not deploy from this issue's local worktree, apply a production migration
manually, modify DNS, or merge until the owner has
reviewed the concrete PR and authorized that rollout.
