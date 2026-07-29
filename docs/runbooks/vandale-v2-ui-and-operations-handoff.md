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

The existing top-level `word_entries.raw` payload remains the UI payload. The
renderer can now use these structured fields:

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

Renderers should prefer these fields over parsing punctuation from
`definition`. For example, `afgrond` is now:

```json
{
  "definition": "een heel steile en diepe plek in de bergen",
  "synonyms": ["het ravijn"]
}
```

The UI should not split remaining `=` characters heuristically. The three
remaining definitions containing `=` are genuine mathematical or explanatory
notation.

Recommended visual hierarchy inside a meaning:

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
add/retire reconciliation plan. It never silently deletes or rekeys an entry.

The obsolete UI-local importer now delegates to the supported ingestion
command, so there is only one write path.

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
