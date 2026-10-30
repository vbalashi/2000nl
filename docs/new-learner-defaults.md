# New learner dictionary defaults

The installation can choose a primary dictionary for each initial learning
language, sources disabled by default, and a name for each saved training.
This is separate from `dictionary_source_settings_v1` catalog/display metadata.

## Configuration

Only server `service_role` can call
`configure_new_learner_defaults_v1(expected_revision, document)`. Never expose
the service key to a browser. The database owner can inspect the current
revision/document in `private.new_learner_defaults`; ordinary accounts and the
service role cannot read that table.

The version 1 document is ordered. The first language becomes the current
learning language and its saved training becomes main. Every language receives
one named, editable, reusable saved training: up to ten cards, direct meaning
exercises, new cards plus reviews. Its scope is the primary dictionary, without
core-vocabulary, frequency, NT2 or collection-membership assumptions.

Example for a fresh demonstration installation after loading demo content:

```sql
SELECT public.configure_new_learner_defaults_v1(0, '{
  "schemaVersion": 1,
  "languages": [{
    "code": "nl",
    "primaryDictionarySlug": "nl-demo",
    "disabledDictionarySlugs": [],
    "trainingName": "Dutch practice"
  }]
}'::jsonb);
```

For your dictionaries, replace the primary and disabled slugs with existing
stable identities in that language. Display names and UUIDs are not keys.
The primary cannot also be disabled. Unknown, duplicate, oversized and
unsupported values are rejected. A label rename does not change identity.

The setter returns `{"conflict":false,"revision":N}`. Subsequent edits must
use that revision. A stale revision returns `conflict:true` and the current
revision without modifying anything. Review the current document before retrying.

The feature installs with SQL `NULL` as its document. Installation alone does
not choose or republish any source. Configure after importing, publishing and
validating intended content, before accepting new learners. No dictionary data
or credentials are included in this feature migration.

## Initialization and failure behavior

Only the existing `auth.users` INSERT trigger initializes defaults. It retains
the allowlisted operator exclusion and inserts settings with `ON CONFLICT DO
NOTHING`. Only a newly inserted settings row receives preferences and saved
trainings, in the same transaction. A private receipt records the applied
installation revision. No cards are enrolled, progress created, or dictionary
publication/entitlements changed.

The primary must be curated, generally published, free and readable by a new
learner. Both configuration and signup verify an actual eligible card with the
existing training selector. A restricted, unpublished, missing, premium-only
or empty primary is rejected. Disabled sources may be unpublished/inaccessible;
recording their IDs never grants access.

If the primary becomes unavailable after configuration, signup fails atomically
with `new_learner_primary_unavailable` or `new_learner_primary_empty`. No partial
account/settings/recipe remains. Restore the source or explicitly replace the
policy. There is no fallback to another dictionary. Shared locks on policy and
dictionary rows serialize initialization against policy/publication changes.

Existing learners are never detected by revision numbers. Login, re-login,
configuration updates and ordinary settings RPCs do not apply defaults to old
accounts, including revision-zero and missing-settings accounts. Source choices,
saved trainings, main selection, collections and progress remain unchanged.
The starter is ordinary account-owned saved material: edits/deletion are not
undone at login.

Existing material preferences exclude disabled sources from ordinary Library
browse/search, default materials and new training selection. An entitled source
remains visible as disabled in Settings and can be enabled by the learner.
Preferences cannot override publication, entitlements or RLS. Owned collections
and exact-entry details retain their existing access semantics.

## Rollback

Restore a previous valid document using the current revision. Alternatively,
`configure_new_learner_defaults_v1(current_revision, NULL)` restores pre-policy
behavior for future accounts: empty material preferences and no saved starter.
Prefer a known-good policy when future learners must receive a starter.
Neither operation rewrites initialized accounts. Retain schema/receipts when
rolling back configuration. Never globally unpublish a legacy source to change
new-account defaults.

## Validation and deployment ownership

`apps/ui/tests/fsrs/newLearnerDefaults.test.ts` covers persisted main-recipe edits,
new/existing/revision-zero learners, real source bindings/content nodes, RLS,
Library browse/search/counts, launched card identity, manual source enabling,
unavailable primary failures, config updates, operator exclusion, multiple
languages and concurrent initialization. Use a disposable loopback database
via `FSRS_TEST_DB_URL`; the test harness restricts database names to its test
namespace. No general Supabase reset is needed.

Public fresh installs use baseline 287 followed by
`db/migrations/288_learner_dictionary_defaults.sql`. The public contract manifest
pins both checksums. Postflight 288 retains previous checks and adds a
metadata-only defaults/RLS/trigger probe. `scripts/setup-local.sh` still refuses
an existing schema and targets only the public checkout's local database.

The public repository owns this behavior, schema and tests. Managed services
must separately review a **retaining forward migration**, pinned public app
revision, private ops revision, exact checksum, postflight and installation
configuration in their private operational repository. Never replay the fresh
baseline onto a managed database. Public number 288 does not reserve a private
migration number or authorize changing a managed contract signal. Preserve
manifest holds, host gates and explicit release authorization.

For the hosted Dilum policy, the private rollout owner must resolve the actual
Dilum Nederlands primary and Van Dale disabled slugs, retain existing source
IDs, validate publication/access and eligible material, then configure a named
Dilum NL starter. Rehearse a synthetic new learner and an existing account on
the retaining upgrade before activation. This public feature neither publishes
the dictionaries nor activates that managed policy.
