# Versioned Source Entry Bindings

Status: accepted and implemented
Date: 2026-07-24

## Context

`word_entries.id` is already the durable Platform identity used by learning
state, lists, translations, notes, search projections, provenance events, and
external clients. Re-import currently resolves that identity through
`dictionary_id + language_code + headword + meaning_id`:

- the unique index is declared in
  `db/migrations/001_core_schema.sql:143-145` and retained by
  `db/migrations/009_drop_legacy_word_entry_uniqueness.sql:9-11`;
- the bulk importer deduplicates its batch by `(headword, meaning_id)` and
  upserts on the same database key in
  `packages/ingestion/src/importer/core.py:109-166,219-222`;
- the helper importer cache uses the same pair in
  `packages/ingestion/src/importer/db.py:76-88,106-167`;
- copy-to-user-dictionary uses the same conflict target in the current RPC
  definition at
  `db/migrations/059_security_harden_user_scoped_rpcs.sql:141-167`.

That key is not a durable source identifier. The accepted cross-project
architecture audit found 539 VanDale `(headword, meaning_id)` groups spanning
more than one part of speech and at least 570 variants that cannot coexist
under the current index. POS itself is not sufficient as a durable key:

- the parser normalizes only the payload POS
  (`packages/ingestion/src/importer/dictionary_entry_parser.py:20-50,121-128`);
- `meaning_id` may fall back to a filename suffix or `1`
  (`dictionary_entry_parser.py:78-95`);
- `_metadata.index` is mapped to `vandale_id`, but is snapshot position
  evidence rather than proven provider identity
  (`dictionary_entry_parser.py:63-75`).

Source-managed entries and user-owned entries currently share the global
dictionary-scoped uniqueness rule even though their lifecycles and write
semantics differ.

## Decision

### Permanent Platform identity

`word_entries.id` remains the permanent UUID. Import, repair, reordering, POS
normalization, source-key changes, projection changes, and retirement never
derive a replacement UUID.

Every source-managed entry is resolved through a persisted, versioned binding:

```text
(dictionary_id, identity_scheme_version, source_entry_key) -> word_entries.id
```

`source_entry_key` is opaque outside the source adapter. The binding ledger,
not a mutable natural key on `word_entries`, is authoritative for subsequent
imports.

The ledger must record at least:

- dictionary, scheme version, source key, and entry UUID;
- binding state: `active | retired | ambiguous | rejected`;
- first-seen and last-seen import run;
- manifest revision and checksum;
- content fingerprint canonicalization version and fingerprint;
- raw identity evidence and the reconciliation decision;
- aliases from replaced source keys, without rebinding the UUID;
- actor/reason/timestamp for manual decisions.

An import run records counts and identities for `matched`, `new`, `changed`,
`retired`, `ambiguous`, and `rejected`. Two identical approved manifests must
produce no binding or entry-identity changes.

### Disjoint writer spaces

Source-managed and user-owned rows must have an indexable row-level
discriminator on `word_entries`; choosing a conflict target must not require a
join to `dictionaries`.

- An active source-managed row has exactly one active source binding. A retired
  source-managed row remains in the source-managed writer space, keeps its
  retired binding, and has no active binding. In either lifecycle state, its
  write identity comes from the versioned source-binding ledger.
- A user-owned row has no source binding. Its duplicate policy is enforced in a
  separate user-owned identity space.
- A source importer must fail closed if it cannot use the source-managed
  target.
- User RPCs must fail closed if they cannot use the user-owned target.
- The legacy global unique index is not removed until every writer and fixture
  has moved to one of the disjoint targets.

User-owned entries retain the current dictionary-scoped natural identity
`(dictionary_id, language_code, headword, meaning_id)`, enforced by a partial
unique index where `management_kind = 'user'`. Source-managed entries do not
participate in this index.

This decision is based on the production preflight: 3 user dictionaries,
17 user entries, no duplicate natural-key groups, all 17 entries generated
rather than copied, and no evidence of an offline caller-supplied import key.
The copy RPC preserves idempotent copy behavior through the partial user
conflict target. A production-snapshot rehearsal proved that a duplicate
source natural key can coexist while a duplicate user natural key is rejected,
and that two copies of the same source entry resolve to one user UUID.

Evidence required to close that decision:

1. production counts of user dictionaries and entries, including duplicate
   groups by owner/dictionary, normalized headword, POS, and current
   `meaning_id`;
2. examples where one user intentionally owns more than one same-headword
   entry, including generated and copied entries;
3. current copy/create/update behavior and caller expectations for duplicate,
   idempotent-copy, and edit/rename cases;
4. whether a user-owned entry needs a stable caller-supplied/import key across
   offline retry, export/import, or future sync;
5. a compatibility test showing how existing copied entries with
   `raw.sourceEntryId` behave under the proposed rule.

### POS evidence

Persist the normalized POS separately from its evidence status:

```text
normalized_pos_status = known | source-none | unresolved
```

- `known`: approved normalization resolved the source evidence;
- `source-none`: the source explicitly states that POS is absent;
- `unresolved`: evidence is missing, inferred, or contradictory.

Preserve payload, source-header, filename/manifest, and parser evidence. Parser
heuristics may contribute evidence, but they do not silently become a durable
identity. `unresolved` never participates in automatic fallback matching.

The first manifest must also establish a `source_group_key` for the set within
which sense ordinals/counts belong. Same-POS homographs must be representable as
different groups. The group key is source-adapter identity, not a new public
lexeme aggregate.

### Exact UUID preservation and ambiguity

For the first binding, reconciliation is group-atomic:

1. collect the manifest artifacts and every plausible existing UUID for one
   source group;
2. compare a versioned canonical source-content fingerprint with the content
   stored on each candidate UUID;
3. retain an existing UUID only through a unique one-to-one artifact match;
4. if an existing candidate has no exact match, multiple matches are
   plausible, or two assignments compete for the same UUID, mark the whole
   affected group `ambiguous` and make no automatic mutation for that group;
5. only after every legacy candidate in an otherwise unambiguous group is
   accounted for may an artifact with no plausible legacy candidate be
   explicitly approved as restored/new and receive a new UUID;
6. never copy, split, merge, or reassign historic user state between UUIDs;
7. record legacy ambiguity when the content a learner saw cannot be proven.

The identity-matching fingerprint is independent of presentation/API
fingerprints. A projection-only change cannot alter a source binding.

### Retirement

A source artifact absent from a later approved manifest retires its binding
and entry; it is not hard-deleted. Retirement preserves direct-by-ID/history
resolution and all UUID references.

Retirement policy remains deferred because the first implemented manifest
retires no entries. Until a scheduler policy is accepted, the importer fails
closed on any manifest membership change and cannot retire or add source
bindings implicitly. Before the first retirement, characterize production rows
with learning/list state and choose one explicit policy:

- continue current active training;
- exclude from future selection but preserve direct/history access; or
- a separately versioned compatibility state.

Hard deletion of a source-managed entry with any UUID consumer is not an
allowed cutover operation.

## Cutover gates

No schema cutover or production re-import may begin until all gates pass:

1. a versioned corpus manifest is reproducible and checksummed;
2. every artifact is bound once or explicitly `ambiguous`/`rejected`;
3. every current UUID maps to exactly one manifest decision;
4. every foreign-key and soft UUID consumer in the Wave 0 inventory has
   preflight count/checksum queries;
5. the user-owned uniqueness decision above is closed;
6. all writers, `ON CONFLICT` targets, fixtures, probes, and import caches use
   their new disjoint identities;
7. additive schema and backfill have been rehearsed on a production-like
   snapshot;
8. a restorable snapshot, write/import pause, and incompatible-writer
   detection are proven;
9. `pre UUIDs ⊆ post UUIDs`, and `post - pre` equals only approved restored
   entries;
10. existing-UUID reference counts/checksums remain identical and restored
    UUIDs have no historical user state;
11. strict lookup completeness for a fixture with more than ten candidates is
    proven before restored entries are exposed;
12. pre-exposure rollback and post-exposure retire/disable roll-forward are
    rehearsed.

After the first user write to a restored UUID, rollback must retire/disable and
roll forward; it must not delete the restored entry.

## Implementation record

The first production cutover completed on 2026-07-29:

- the manifest is deterministic and checksummed;
- all 18,163 artifacts have one active binding;
- every one of the 17,408 previous UUIDs was preserved;
- 755 explicitly approved restored artifacts received new UUIDs;
- no decisions were ambiguous, rejected, or retired;
- all existing-UUID user-state counts and checksums were unchanged;
- restored UUIDs had no historical user state;
- the production-like restore rehearsal and the production cutover both
  completed successfully;
- public and authenticated strict lookup returned all 12 candidates for the
  real `goed` collision group when called with limit 50;
- an identical manifest is a verified database no-op.

The operational and UI handoff is
`docs/runbooks/vandale-v2-ui-and-operations-handoff.md`.

## Consequences

- Import becomes reconciliation against a manifest and ledger, not a blind
  natural-key upsert.
- POS collisions can coexist without treating POS as permanent identity.
- Existing learning identity remains stable.
- Ambiguity becomes visible operational state and can block only affected
  entries or the cutover, rather than corrupting UUID bindings.
- A separate ADR or amendment must close user-owned uniqueness and retired
  scheduler behavior before implementation.
