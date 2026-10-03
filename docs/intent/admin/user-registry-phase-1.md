# Admin user registry — phase 1

Status: implementation proposal for issue [#481](https://github.com/vbalashi/2000nl/issues/481), based on the reviewed v0.1 screens in `2000nl-admin.pen` (20.50 and 20.60).

## Scope

Provide an operator-only, read-only registry and profile for learner accounts.
The first phase supports searching by email or account ID, bounded pagination,
registration time, last Supabase sign-in, and counts of personal user-created
lists and list-entry links. It does not edit learner state or expose payment
records, subscription grants, or list contents. Published dictionaries and
curated/public collections are not included in these personal-list counts.

Dedicated operator identities without `user_settings` are not learner records.
Exclude those accounts when they match an active or inactive `admin_operators`
row by bound user ID or normalized email. An account with a persisted learner
profile remains visible even when it also has operator permissions (#571).
Administrative login does not create a learner profile to make an operator visible.

## Sources and projections

| Displayed fact | Authoritative source | Missing value behavior |
| --- | --- | --- |
| Account ID, email | `auth.users.id`, `auth.users.email` | Missing email is `Нет данных` |
| Registration | `auth.users.created_at` | Never inferred |
| Last sign-in | `auth.users.last_sign_in_at` | `Нет данных` when null; this is not app activity history |
| Personal lists | `user_word_lists` rows for the account | `0` when none exist |
| Entry links in those lists | `user_word_list_items` rows joined through the account's lists | `0` when none exist; counts links, so the same word in two lists counts twice |

Search does not filter by plan or payment. The RPC takes the visible page size and returns one extra row to
determine `hasNext`; OFFSET uses only the visible page size. It does not calculate a total account count. Search text
is never placed in admin audit events.

## Access and audit

The server requires the separate `users.read` operator permission for both
registry and profile APIs. User list reads write `user.registry.read`; profile
reads write `user.profile.read`. Audit targets identify the page or account ID,
not an email, query string, profile payload, or list contents. Responses are
private and non-cacheable. Read failures return no partial account data.

The registry does not read `user_settings.subscription_tier`. Until #471
provides a server-owned resolved grant source, access plan, grant origin,
payment state, and plan filters are shown as unavailable. The profile reserves
future tabs for Activity, Content, Access, Payments, and History, but keeps them
disabled until their sources and permissions exist. Inspecting list contents
will require a separate scoped permission and audit action.

## Routes

- `/admin/users` — bounded, searchable learner registry.
- `/admin/users/{userId}` — read-only account facts and personal-list counts.
- `GET /api/admin/users?q=&page=&pageSize=` — requires `users.read`.
- `GET /api/admin/users/{userId}` — requires `users.read`.
- `public.admin_user_registry_page(text, uuid, integer, integer)` — service-role-only bounded projection; direct `anon` and `authenticated` execution is revoked.

No user suspension, deletion, impersonation, grant changes, payment integration,
or new account-data collection is included.
