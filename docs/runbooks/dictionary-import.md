# Dictionary Import: Purpose, Cost, and When to Run It

The full dictionary importer is a **content deployment**. It turns the
checksummed source corpus into the durable database state used by Library,
Training, dictionary lookup, connected clients, and later form/search jobs. It
is not required every time the application, local Supabase, or a test starts.

## Runtime expectation

The checked-in Van Dale corpus used for the issue #397 measurement contains
18,163 artifacts. On 2026-09-29, a clean local import completed in **155.74
seconds**. An identical completed-manifest replay completed in **9.12 seconds**
and made no content changes.

These are dated measurements, not universal guarantees or lower bounds. CPU,
Docker, disk, antivirus/indexing, and concurrent agents can make the initial or
changed import slower. Operators should expect roughly several minutes for a
changed full corpus. A run that is substantially beyond that range should be
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
5. **Reconcile Content Nodes.** Definitions, examples, idioms, usage notes, and
   their parent/child relationships become individually identified nodes.
   Existing node UUIDs are preserved when the same semantic content survives a
   new release. This is substantially more work than inserting one row per
   headword, but it preserves exercise/report identity across reimports.
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

## Why 18,000 entries still take minutes

The expensive unit is not “one word”. A word may contain several meanings and
many Content Nodes, and each existing identity must be compared rather than
blindly replaced. The complete measured result contained about 40,000 active
Content Nodes. PostgreSQL must maintain constraints and indexes for those rows,
check group relationships, and preserve all-or-nothing transaction semantics.

Migration 177 removed the accidental quadratic-like part—refreshing the same
group projection after individual row changes—but it did not remove the useful
validation and identity work. More speed is possible, but only with a larger
design change such as staging the whole release and applying set-based diffs.
That would need parity tests for node identities, report atoms, list membership,
and training eligibility before replacing the current fail-closed path.

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

## Could it be faster?

Yes, but the safe options are different depending on the goal:

- **Avoid the work:** reuse an already populated DB, restore a snapshot, or use
  the small fixture. This is the best answer when full source provenance is not
  what the task is testing.
- **Take the no-op path:** do not regenerate manifests unnecessarily. The same
  manifest is verified and exits without reconciliation.
- **Update only changed content:** the importer already preserves identities,
  but today a changed manifest still performs broad comparison and transactional
  reconciliation. A future staged diff could narrow writes further.
- **Build a bulk staging pipeline:** load source rows into temporary tables,
  compute set differences in SQL, and apply only inserts/updates/retirements.
  This is the likely next major optimization, but it must retain the current
  atomicity and identity guarantees.

Therefore the target is not “make every full import instant.” The operational
target is: do not run it when it is unnecessary; make identical replay cheap;
and keep a genuinely changed content deployment bounded, observable, and safe.
