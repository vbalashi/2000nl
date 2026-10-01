# ADR-0017: Account material preferences and existing-session boundaries

Date: 2026-09-30. Status: accepted ownership/storage; launch/selector integration pending.
Source: [user decision](../discussions/2026-09-30-02-paused-training-material.md), [integration plan #407](../exec-plans/407-integration-readiness.md).

Learning-language ordering/pausing and enabled dictionaries are selection
preferences. Dictionary entitlement remains owned by `can_access_dictionary`,
and training membership/progress remains owned by the existing session and
scheduling contracts. Preferences must synchronize between devices without
rewriting those owners or unrelated appearance/training-setup settings.

Store a versioned material document and revision in the existing `user_settings`
row, under its existing own-row RLS. The document contains ordered
`learningLanguages` (`code`, `paused`) and `disabledDictionaryIds`. An empty
language list preserves the existing implicit available-language catalog.
An explicitly configured language list retains at least one active language,
matching the approved prototype. ISO codes are identities; labels/localization
and dictionary descriptions belong to read models, not the preference document.
No language/dictionary ACL or content records are created by a preference save.
A language can be added before content becomes available; adding it does not
promise material or grant dictionary access.

The authenticated save RPC derives the user from `auth.uid()` and atomically
compares the expected revision under a row lock. A stale device receives the
current snapshot rather than overwriting it. Database and client validation
reject duplicates, invalid codes/UUIDs, unknown fields and oversized documents.
Only the material columns and update timestamp are written. No browser
restoration/import or optimistic success fallback is introduced.

Distinguish a new run from continuation of an existing run. New launches/plans must resolve the account's current material
preferences on the server, in addition to existing entitlement checks. A
started run must retain its frozen material selection when preferences change,
including member replacement; entitlement revocation continues to be checked.
Client-supplied old snapshots must not bypass current preferences at new start.
Retrying an existing idempotent start request must retain the original receipt.
Do not filter the existing all-readable catalog RPCs globally: resume validation
and Settings still need to see paused/disabled but readable material.

Migration 183 implements only storage, validation and conflict-safe saving.
No functioning pause/toggle UI is exposed before server launch/selection
integration and resume tests establish these semantics. Existing selectors,
current sessions, saved setups, progress and access checks are unchanged by
this migration. The presentation rollout remains opt-in.

Migration 184 implements that server boundary. Plans and new starts resolve the
account document and overwrite any caller-supplied material snapshot. New runs
store the snapshot in their existing `training_filter`; source relations and
replacement candidates consume it without rereading mutable settings. Existing
sessions with no snapshot retain their previous scope. Access/entitlement checks
remain independent and live. Idempotent receipts are checked before resolving
current settings, including cached v1 idiom/translation starts.

The cached candidate contracts keep their global scope and ordering through
private filtered variants derived from the latest installed definitions. Their
material predicate runs before ordering/offset/limit, so disabled candidates do
not consume a page's quota. Future changes to those legacy candidate definitions
must also update these derived variants or retire the cached start boundary.

Account Settings controls and Training/Library selector adapters remain pending;
storage and server enforcement alone are not completed product integration.
