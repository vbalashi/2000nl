# Dictionary Import: Purpose, Cost, and When to Run It

The full dictionary importer is a **content deployment**. It turns the
checksummed source corpus into the durable database state used by Library,
Training, dictionary lookup, connected clients, and later form/search jobs. It
is not required every time the application, local Supabase, or a test starts.

The [Russian explanation](dictionary-import.ru.md) describes each operation and
which checks apply to empty-database loading versus updates.

## Runtime expectation

The checked-in Van Dale corpus used for the issue #397 measurement contains
18,163 artifacts. On 2026-09-30, migration 178 staging completed initial import
in **20.39 seconds**, identical replay in **8.78 seconds**, and a one-definition
update in **16.73 seconds**. The update wrote one word row, reconciled one entry,
and refreshed one entry; the initial load made zero historical-reconciler calls.
Final counts: 18,163 active bindings, 40,403 active nodes, 568 projection rows.

After strengthening parent/binding identity verification, another complete run
took 21.835/8.666/18.203 seconds on Apple M2 Max (64 GiB host RAM), PostgreSQL
17.6 in local Docker. Exact stage metrics, corpus checksum and implementation
commit are recorded in [benchmark evidence](../diagnostics/issue-397-staged-import-benchmark-2026-09-30.json).

The earlier 155.74/9.12-second observations from 2026-09-29 belong to intermediate
implementations. A later final-version run that day was interrupted; resource
contention was a hypothesis, not a proven explanation. Those earlier timings
must not be represented as verification of every subsequent implementation.

These are dated measurements, not universal guarantees or lower bounds. CPU,
Docker, disk, antivirus/indexing, and concurrent agents can make the initial or
changed import slower. Budgets on the supported local setup are 60 seconds for
initial/one-entry update and 15 seconds for identical replay. Mass content
updates still invoke identity reconciliation for genuinely changed entries and
have a different cost. A run substantially beyond the relevant budget should be
inspected for an active PostgreSQL statement, lock wait, or resource contention
rather than blindly restarted: cancelling the enclosing transaction discards
all work from that attempt.

## What happens, in plain language

Think of each JSON artifact as a small source document, not as one ready-made
database row. For every run the importer does the following:

1. **Verify the package.** It reads the manifest, checks every filename and
   checksum, validates the source format, and proves that the set of files is
   the declared release. This prevents a half-copied or mixed corpus from being
   accepted.
2. **Recognize an identical release.** If the same completed manifest is
   already recorded with exact active-binding coverage, the importer stops.
   This is the approximately 9-second no-op path: most of that time is file and
   checksum verification, not database writing.
3. **Resolve durable word identity.** A source key is matched to its existing
   `word_entries` UUID, or a UUID is created for a genuinely new word/sense.
   Stable UUIDs matter because lists, cards, learning history, provenance, and
   connected clients refer to them. Dropping and recreating the 18,000 rows
   would be faster but would break those references.
4. **Upsert source bindings and word data.** The importer records which source
   release owns each entry and updates its normalized dictionary payload. It
   refuses ambiguous membership, silent deletion, or unsafe re-keying.
5. **Stage and apply Content Nodes.** COPY loads prepared source data into
   transaction-local staging. Entries with no node history are inserted in bulk
   and their parents linked afterwards. SQL compares actual existing node
   content/order/parents; only changed entries use the established UUID-preserving
   reconciler. Retired history counts as history and cannot take the fresh path.
6. **Refresh derived training eligibility.** Some later ordinary meanings
   cannot be trained directly until they have usable context. The database
   derives that exceptional set from source groups and Content Nodes. Migration
   177 batches and deduplicates this refresh; before #397, row triggers repeatedly
   rescanned the same groups and the import exceeded 25 minutes.
7. **Update list membership and commit once.** The NT2 list links are reconciled
   and the whole operation commits atomically. If any file or reconciliation
   fails, bindings, nodes, list changes, and the derived projection roll back
   together instead of leaving a half-imported dictionary.

The importer intentionally does **not** rebuild everything. `word_forms` and
dictionary search documents are separate jobs because many workflows need the
canonical dictionary update without paying for both derived indexes immediately.

## Where the remaining time goes

The expensive unit is not “one word”. A word may contain several meanings and
many Content Nodes, and each existing identity must be compared rather than
blindly replaced. The complete measured result contained about 40,000 active
Content Nodes. PostgreSQL must maintain constraints and indexes for those rows,
check group relationships, and preserve all-or-nothing transaction semantics.

Migration 177 reduced repeated group refresh; migration 178 additionally removes
per-entry historical comparison from fresh loads, skips reconciliation of
unchanged nodes, and refreshes projection entries only when structural bindings
or content change. File/manifest validation alone took 7.86 seconds in the
recorded initial run. Word writes took 1.50s, COPY 0.85s, staging/bindings 1.55s,
nodes 1.72s, projection 4.77s, and commit 0.23s. These timers do not include
bootstrap, benchmark corpus copying, forms, or search indexing.

Fresh local tests still validate files, duplicates, kinds and parent references;
they do not need historical UUID matching. A test of update behavior deliberately
creates prior fixture state first. Ordinary QA may use the smaller fixture.

## When to run what

| Goal | Recommended operation |
| --- | --- |
| Start the app or run browser QA | Do not run the full import. Reuse the populated local DB or load the small committed fixture. |
| Run ingestion correctness tests | Use `scripts/db-local-supabase.sh test-ingestion`; it creates a disposable DB and production-shaped medium fixture. |
| Populate a brand-new empty local DB with real dictionary content | Run the full import once. |
| Apply a newly generated/changed source manifest | Run the full importer, then the form/search jobs required by that release. |
| Confirm that a release was already applied | Rerun safely; expect the approximately 9-second verified no-op, or query the import ledger in a read-only check. |
| Create another disposable environment quickly | Prefer a small fixture or restore/clone a known-good database snapshot when exact full-corpus provenance is not under test. |
| Test migration/schema behavior only | Bootstrap plus probes/tests is sufficient; no full corpus is required. |

The full command for the canonical local database is:

```bash
scripts/bootstrap-worktree.sh --install --ingestion
scripts/db-local-supabase.sh import
scripts/db-local-supabase.sh probe
```

Do not use the local wrapper against staging or production. Production content
deployments follow the reviewed database contract and the operational handoff.

## Reproduce the measurements

```bash
.venv/bin/python packages/ingestion/scripts/benchmark_source_import.py \
  --data-dir /absolute/path/to/words_content
```

The harness creates a unique loopback-only disposable database, bootstraps it,
runs initial/no-op/one-entry update, prints stage timings and counts, enforces
60/15/60-second budgets, and removes the database in a `finally` block. The
changed corpus is a temporary private copy; original files remain unchanged.

## Could it be faster?

Yes, but the safe options are different depending on the goal:

- **Avoid the work:** reuse an already populated DB, restore a snapshot, or use
  the small fixture. This is the best answer when full source provenance is not
  what the task is testing.
- **Take the no-op path:** do not regenerate manifests unnecessarily. The same
  manifest is verified and exits without reconciliation.
- **Update only changed content:** staging now detects actual node differences
  and invokes historical reconciliation only for changed entries. Membership
  additions/removals and moved source identities continue to require an explicit
  reviewed plan; staging does not automatically delete existing entries.
- **Reduce file verification cost:** a prepared archive or safely invalidated
  verification cache could reduce the 7–9 seconds spent on thousands of files.
  This needs a separate design for detecting source changes.

Therefore the target is not “make every full import instant.” The operational
target is: do not run it when it is unnecessary; make identical replay cheap;
and keep a genuinely changed content deployment bounded, observable, and safe.
