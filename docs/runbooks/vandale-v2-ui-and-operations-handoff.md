# Van Dale v2 UI And Operations Handoff

Status: production cutover completed
Date: 2026-07-29
Dictionary: `nl-vandale`
Schema: `nl-vandale-v2`, version 1

## Outcome

The Van Dale parser, generated corpus, importer, word-form projection, and
production database now preserve lexical structure that the previous pipeline
flattened or lost.

Production contains:

- 18,163 active source-managed Van Dale entries;
- all 17,408 pre-cutover entry UUIDs unchanged;
- 755 restored entries with new UUIDs;
- 18,163 unique versioned source bindings;
- 68,102 word-form rows;
- 18,163 current search documents for Van Dale entries;
- 17 user-owned dictionary entries unchanged.

The restored UUIDs had zero historical card state, events, reviews, user-list
items, notes, or translations at cutover. Existing user-state table counts and
checksums were identical before and after the import.

## UI Data Contract

`word_entries.raw` is the internal persistence payload, not a client contract.
Issue #70 owns publishing the following structured fields through the
documented Platform projection/response DTO before 2000nl or AudioFilms renders
them:

- `meanings[].synonyms: string[]`
- `meanings[].antonyms: string[]`
- `meanings[].usage_labels: string[]`
- `meanings[].grammar: object`
- `meanings[].note: string`
- `meanings[].pronunciation_note: string`
- `meanings[].cross_references: { headword, meaning_id? }[]`
- `meanings[].idioms[]`, where an item can contain `expression`,
  `explanation`, and its own `examples[]`
- `reference_tables[]`, containing a `title` and `{ label, value }[]` rows
- `alternate_headwords[]`, which may contain either a string or a structured
  object with `headword`, `pronunciation`, `gender`, and `plural`
- top-level `cross_reference` for entries that only redirect to another
  headword
- `part_of_speech_evidence` for the distinction between source-confirmed and
  inferred/unresolved POS.

The Platform projection should preserve this structure instead of parsing
punctuation from `definition`. For example, the stored source payload for
`afgrond` is now:

```json
{
  "definition": "een heel steile en diepe plek in de bergen",
  "synonyms": ["het ravijn"]
}
```

Clients must not read `word_entries.raw` directly and must not split remaining
`=` characters heuristically. The three remaining definitions containing `=`
are genuine mathematical or explanatory notation.

Recommended visual hierarchy once these fields are present in the projected
SenseCard DTO:

1. definition and context;
2. examples;
3. compact synonym/antonym chips;
4. usage and grammar labels;
5. idioms, with idiom-specific examples nested under the idiom;
6. notes, cross-references, and reference tables.

Unknown or empty optional fields should remain invisible. Cross-reference-only
entries legitimately have an empty `meanings` array.

## Parser Quality Evidence

The deterministic corpus contains:

- 18,019 meanings;
- 3,715 synonym terms;
- 647 antonyms;
- 679 sense-level cross-references plus 144 cross-reference-only entries;
- 1,347 idiom-specific examples;
- 283 usage labels;
- 394 sense grammar objects;
- 81 notes and 2 pronunciation notes;
- 252 preserved reference-table occurrences.

All 18,163 artifacts pass the Dutch JSON Schema. Source-entry keys and artifact
paths are unique. A second generation from the same 14,449 source records
produced an identical manifest:

```text
input SHA-256:
1d9236554fd35f49ca9fa274045d84a5ee3ea04035a85f89a21391878b685173

manifest SHA-256:
45fc68e1dee018f3e778d88ec22d7805fb90588b1d1dacd226e3ae6024b621ce
```

In addition to the automated corpus scan, a stratified manual sample of 33
entries covered nouns, verbs, adjectives, function words, cross-reference-only
entries, multiple senses, idioms, tables, and inferred POS. No semantic loss
was found in that sample.

Twenty-two entries still have no normalized POS. This is explicit in their
evidence status and is no longer hidden by a default or used as identity.

## Operational Import

For a future identical or content-only re-import:

```bash
python packages/ingestion/scripts/import_words_db.py \
  --data-dir db/data/words_content

python packages/ingestion/scripts/import_word_forms.py \
  --data-dir db/data/words_content

db/scripts/run_dictionary_search_backfill.sh start 2 500
```

An identical completed manifest is verified and produces no database changes.
If source membership changes, the importer stops and requires an explicit
add/retire reconciliation plan. A normal content-only update keeps its bound
UUID; if semantic fingerprints move between ordinal keys in one source group,
the importer fails closed and requires group-atomic reconciliation. It never
silently deletes or rekeys an entry.

The obsolete UI-local importer now delegates to the supported ingestion
command, so there is only one write path.

### Pointer-only content updates

When a parser change converts definition-like source content into an explicit
top-level `cross_reference`, use this order. The order is a compatibility gate:
the old UI cannot present a cross-reference-only record safely.

1. Create a fresh production database backup, verify that `pg_restore --list`
   can read it, and preserve the previously imported generated corpus.
2. Deploy application code that understands the explicit cross-reference DTO
   together with migration `117_exclude_pointer_only_entries_from_training.sql`.
   Confirm `/api/health` reports that exact commit. Read-only production probes
   must confirm the versioned predicate/helper and partial index exist; attach
   staging or transaction-rollback DB-test evidence that both Training scheduler
   wrappers exclude a pointer-only fixture. Do not create a production fixture.
3. Regenerate the corpus cleanly from the source list. Run
   `audit_pointer_meanings.py` over the complete pre-generation source corpus;
   require zero unresolved pointer shapes and review every resolvable candidate.
4. Import the regenerated corpus with `import_words_db.py`. The importer must
   report unchanged membership and UUID-preserving updates; any membership,
   identity-group, or moved-fingerprint error stops the rollout.
5. Run `import_word_forms.py`, refresh search documents, and replay
   `import_words_db.py`. The replay must be a verified no-op.
6. In production Library, verify that `daar` meaning 2 has only an **Open
   reference** action, cannot be learned or marked known, and opens the full
   `daar-` entry. Run the authenticated scheduler smoke against the now-real
   `daar` pointer and confirm Training does not select the pointer-only record.

If the pointer smoke fails, keep the compatible application deployed and roll
the data forward by re-importing the preserved previous manifest, then rebuild
word forms and search documents. Do not deploy the old application while the
new cross-reference-only data is active, and do not delete or recreate entry
UUIDs. A full database restore is reserved for disaster recovery because it
would also rewind user learning state.

## Backups And Recovery

Fresh pre-cutover production backup:

```text
/Users/khrustal/adhoc/2000nl-vandale-backups/
production-pre-vandale-20260729T1731Z.dump

size: 12,591,145 bytes
SHA-256:
cb2f9fe98c90945dc9fa24ed52822d9a69d225d41aa5e9a04f74b768094fdead
```

The archive was successfully listed with `pg_restore` and has owner-only
permissions.

The previous generated directory is preserved at:

```text
/Users/khrustal/adhoc/2000nl-vandale-backups/
words_content-pre-v2-20260729T1727Z
```

The new corpus is installed at `db/data/words_content`.

Because restored entries are now exposed, do not delete their UUIDs during a
rollback. A post-exposure rollback must retire or disable affected source
bindings/entries and roll forward, preserving any user state created after
cutover. The full database backup is the disaster-recovery point, not the
normal rollback mechanism.

## Production Verification

- Import result: 755 inserted, 17,408 UUID-preserving updates.
- Reconciliation result: no ambiguous, rejected, or retired entries.
- Search backfill: 18,180 of 18,180 rows completed, including 17 user entries.
- Public lookup with limit 50 returns all 12 `goed` candidates and all 11
  `slag` candidates.
- Authenticated lookup with limit 50 returns all 12 `goed` candidates.
- Re-running the completed manifest reports a verified no-op and does not even
  change dictionary metadata timestamps.

## Platform V2 Content Node rollout

Platform V2 migrations deliberately do not infer source-managed Content Nodes
from `word_entries.raw`. The checksummed source manifest remains the authority.
When migrations `105` through `119` are deployed, keep
`PLATFORM_V2_LOOKUP_ENABLED` and `PLATFORM_V2_ACTIONS_ENABLED` unset and run:

```bash
python packages/ingestion/scripts/import_words_db.py \
  --data-dir db/data/words_content

python packages/ingestion/scripts/import_words_db.py \
  --data-dir db/data/words_content
```

The first replay reconstructs any missing Content Nodes in one database
transaction. The second replay must report a verified no-op. That no-op check
compares the manifest, active source bindings, persisted source content, and
the complete `(kind, sourceTextFingerprint)` Content Node multiset for every
entry. A mismatch repairs through a normal replay or fails closed; it is never
accepted as ready.

While `PLATFORM_V2_LOOKUP_ENABLED` remains unset, verify that migration `108`
created the service-only `lookup_platform_v2_entries` RPC and run a direct
service-role RPC smoke. Functional route smoke requires the flag: enable it
temporarily only in an isolated staging environment, run the route checks, and
keep production disabled until those checks pass.

Migration `119` wraps the same lookup and exact-training RPC signatures so each
item carries its internal presentation identity without a second PostgREST
request. Apply it before the compatible application release, then verify a
non-empty V2 lookup has `lookup.db` timing but no separate `lookup.identity`
round-trip timing. Rollback may restore the previous application first because
the older projection ignores the added internal item field.

Only after the verified no-op and V2 smoke checks may the runtime set
`PLATFORM_V2_LOOKUP_ENABLED=1`. Unset it to darken both authenticated and
catalog V2 lookup without changing V1 or reassigning any published identity.

Keep `PLATFORM_V2_ACTIONS_ENABLED` unset until migration `113` Known/Undo
database tests and the authenticated action-route smoke pass. Enable it
separately after lookup. Unsetting it removes V2 progress capabilities and
rejects V2 mutations, but deliberately preserves accepted Known Marks and
their immutable history.
