# ADR-0016: Transaction-local staging for dictionary imports

Status: accepted; implementation in migration 178 and packages/ingestion.
Date: 2026-09-30.
Discussion: [fresh loading versus historical reconciliation](../discussions/2026-09-30-01-dictionary-import-staging.md).

## Context

A dictionary release is structured content, not merely headword rows. Existing
word and Content Node UUIDs carry durable references from lists, exercises and
reports. Updating an existing dictionary requires identity reconciliation;
initial loading of entries without any node history does not. Calling the
per-entry reconciler even on empty dictionaries imposed unnecessary overhead.

## Decision

`packages/ingestion` owns validation of manifests, source identity/membership
guards, normalized word payloads and COPY transport. Private functions in `db`
own the staged content application and derived training projection.

Use transaction-local temporary staging tables. Input validation remains for
all scenarios. Entries with no Content Nodes, including no retired history,
receive a set-based insertion and a subsequent parent-link update. Entries
with history are compared by actual stored content, ordering and parent identity;
only differences invoke the established durable UUID reconciler. A parent is
identified by its corresponding incoming node/order, never just by its locator.
An identical completed manifest takes a structurally verified no-op path.

Apply bindings, nodes, list membership and projection in one transaction.
Failure rolls back the entire release. Keep ordinary interactive row-trigger
refresh and deferred commit protection, so omitted explicit finish cannot
commit stale derived data. Release metadata alone does not require projection
refresh. Importer entrypoints remain private and ungranted to application roles.

Do not infer permission to delete source membership. Additions, retirements and
source-key/group movements retain explicit reviewed reconciliation-plan guards.
An empty local database selects the fresh path automatically; there is no
operator flag that disables validation or discards history in populated data.

## Consequences and verification

Initial loads avoid historical searches while updates preserve unchanged UUIDs.
Forms and search documents remain separate jobs. Tests cover fresh/ordinary
parity, changed-only reconciliation, identity corruption, atomic rollback and
the ordinary trigger paths. A local-only benchmark creates and removes its own
database and reports stage timing/counts for initial, no-op and one-entry update.

Remaining limits: the whole input package is validated each time; mass content
changes may still invoke many historical reconciliations; source membership
changes are detected but not automatically applied. See
[Russian runbook](../runbooks/dictionary-import.ru.md) for operating scenarios.
