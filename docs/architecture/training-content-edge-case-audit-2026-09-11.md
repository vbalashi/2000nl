# Training content edge-case audit: source examples classified as idioms

Date: 2026-09-11

Repository: `2000nl`

Issue: [#336](https://github.com/vbalashi/2000nl/issues/336)

Parent decisions: [#195](https://github.com/vbalashi/2000nl/issues/195),
delivery coordination [#327](https://github.com/vbalashi/2000nl/issues/327),
idiom exercise consumer [#332](https://github.com/vbalashi/2000nl/issues/332)

## Scope and boundary

This is a bounded, read-only corpus and parser investigation. It establishes
where the `drop` mismatch first appears, inventories related shapes in the
available artifacts, and records repair leaves. It does **not** rewrite source
content, regenerate IDs, backfill Platform V2 nodes, migrate learner state, or
query private production learner data.

The inspected generated corpus is local evidence under:

`/Users/khrustal/adhoc/vandale-generated-v2-final.lcuoh0/words_content`

Its manifest summary declares:

```json
{
  "artifact_count": 18163,
  "artifact_format_version": "vandale-structured-v2",
  "identity_scheme_version": "vandale-provider-article-v1",
  "source_record_count": 14449
}
```

The artifact census below excludes `_manifest.jsonl` and
`_manifest.summary.json` from the entry denominator. No production census is
claimed.

## Finding: earliest confirmed divergence

The exact artifact is:

`003081_a3045_drop_zn_1.json`

It has source entry identity `fnt:vandale-provider-article-v1:...:1`, provider
article ID `a3045`, source index `3081`, and local entry ID
`3d62c5f5-381f-4019-bdaf-3158c1803182` in the previously inspected local
database.

The source HTML for the only meaning contains:

- definition: `zwart snoep`;
- a `voorbeelden` link;
- two following `span.f0c` containers, each containing an `span.f3i` expression;
- neither container has `span.f3n` (idiom explanation) or `span.f2s` (example
  sentence).

The two expressions are `zoete en zoute drop` and `een dropje nemen`.

The current parser in
[vandale_html_parser.py](../../packages/scraper/vandale_html_parser.py#L1128-L1164)
does this:

1. regular examples are collected only from `span.f2s` that are not nested in
   `f0c`/`f1f`;
2. every `span.f0c` under a meaning is then collected as an idiom;
3. the first `span.f3i` becomes `expression`, while `span.f3n` is optional.

That makes the source fragment deterministic as:

```json
{
  "definition": "zwart snoep",
  "examples": [],
  "idioms": [
    {"expression": "zoete en zoute drop"},
    {"expression": "een dropje nemen"}
  ]
}
```

The v2 projection in
[source_manifest.py](../../packages/ingestion/src/importer/source_manifest.py#L124-L165)
faithfully turns those fields into two `kind: "idiom"` nodes and emits no
`idiom-explanation` nodes. It is not the first divergence: the semantic choice
has already been made by the HTML parser/source adapter. The projection does
not have enough provenance to infer that a bare expression under a
`voorbeelden` marker should be an ordinary example.

This is a confirmed classification mismatch, not proof that every
explanation-less expression in the source is semantically an ordinary example.
The source marker and the absence of idiom explanation are strong evidence for
these two records; broader relabelling requires a source-shape repair policy.

## Characterization coverage

The isolated branch adds two tests:

- `packages/scraper/tests/test_vandale_html_parser.py` replays the exact
  `drop`-shaped HTML and locks the current parser output;
- `packages/ingestion/tests/unit/test_source_manifest.py` locks the current
  projection of the stored `drop` payload, including source paths and the
  absence of parent/explanation nodes.

These are characterization tests. They intentionally preserve the current
wrong classification until a separately approved repair defines the correct
source rule.

## Current v2 census

All counts are from the generated-v2-final artifact directory, with one JSON
object per entry artifact.

| Measure | Count | Interpretation |
|---|---:|---|
| Entry artifacts | 18,163 | Manifest denominator |
| Source records | 14,449 | Manifest denominator; not equal to split artifacts |
| Meaning objects | 18,019 | Split artifact meanings |
| Idiom items | 2,376 | All are object-shaped in this corpus |
| Idiom items with nonblank explanation | 2,374 | Existing baseline |
| Idiom items without explanation | 2 | Both are the `drop` expressions above |
| Idiom items with examples | 1,325 | Nested idiom examples present |
| Idiom items without examples | 1,051 | Valid sparse shape until mode policy decides otherwise |
| Nested idiom example items | 1,347 | Not ordinary meaning examples |
| Meanings with definition and idiom | 869 | Ordinary + idiom mixed meanings |
| Meanings with idiom but no definition | 1,089 | Idiom-only meaning shapes |
| Meanings with multiple idioms | 231 | Maximum observed idioms in one meaning: 26 |
| Entries with empty meanings and cross-reference metadata | 144 | Pointer/cross-reference candidates |
| Meanings with cross-reference metadata | 671 | Cross-reference relationships are broader than pointer-only entries |

The census also found 13,332 ordinary meaning-example items across 12,239
meanings. This is a separate field from the 1,347 nested idiom examples.

## Related edge cases: confirmed versus not inferable

### Confirmed in this artifact set

- **Two source examples stored as idioms without explanations:** exactly the two
  `drop` expressions. Both reproduce through the parser and projection tests.
- **Object/scalar variation:** no scalar idioms were found; all 2,376 items use
  the object form. The parser and schema still accept more than one shape, so a
  future ingestion should keep a fixture for scalar input.
- **Missing text:** no blank idiom expression was found, and no explanation
  field was present with blank text. The two affected items omit the
  `explanation` property entirely.
- **Multiple idioms:** 231 meanings contain more than one idiom. Any repair
  must preserve per-expression identity and ownership rather than collapsing a
  meaning to one fallback.

### Valid sparse shapes, not defects by themselves

- 1,089 idiom-only meanings are real structured shapes in this corpus. They
  should be handled by the separate idiom exercise policy; a regular
  definition exercise must not borrow a sibling definition.
- 1,051 idioms have no nested example. The absence of an example is not an
  ingestion error when an explanation exists.
- 869 meanings combine a normal definition with one or more idioms. The two
  content families must remain separate in projection and in exercise
  eligibility.

### Not decidable from the artifact layer alone

- false idioms that happen to contain explanation-like text;
- example/idiom ownership errors when several source blocks are adjacent;
- orphan Platform V2 explanation nodes after import;
- translation-cache bindings, content-node identity changes, or learner-state
  impact;
- whether a source `f0c` block without `f3n` is an ordinary example in every
  dictionary layout.

Those require either a larger source-shape sample, database node queries, or a
source contract decision. They are not silently counted as confirmed defects.

## Provenance comparison

The following artifact directories were compared file-by-file, excluding their
manifest metadata:

| Artifact set | Entry artifacts | Relationship to generated-v2-final |
|---|---:|---|
| `vandale-generated-v2-final.lcuoh0` | 18,163 | Current bounded baseline |
| `vandale-repro.NIANC5` | 18,163 | Byte-identical across all entry files |
| `words_content-pre-pointer-20260813T1730Z` | 18,163 | Byte-identical across all entry files |
| `words_content-pre-v2-20260729T1727Z` | 17,959 | Older legacy format; do not mix denominators |

The legacy `drop_zn_1.json` has the same `meanings` classification, but lacks
the later source identity/provenance fields. The repeated classification across
the current and pre-pointer artifacts shows that this is not a one-off v2
projection drift; the wrong field assignment is already present in the saved
source-derived payload and predates the current identity metadata.

## Identity and repair implications

No repair should start with a bulk reimport. A future correction needs to:

1. preserve `provider_article_id`, `source_entry_key`, `sense_ordinal`, and the
   existing word-entry identity;
2. define whether a corrected ordinary example replaces an idiom node, creates
   a new node, or retires the old node, with a deterministic mapping;
3. recalculate content fingerprints only after that mapping is approved;
4. audit translation bindings, Platform V2 node IDs, and FSRS/history joins
   before any production write;
5. keep existing learner progress attached to the intended semantic target and
   never copy one idiom state into several newly split exercises.

## Proposed repair leaves

These are separate from this investigation and should be approved before any
content mutation:

1. **Source parser rule:** distinguish `voorbeelden` blocks whose `f0c` child
   has only an expression from idiom blocks with an explanation, while covering
   all observed Van Dale markup variants.
2. **Corpus repair/reconciliation:** produce a dry-run diff for affected
   artifacts, preserving source identity and reporting exact node mappings.
3. **Projection/state migration:** only if the dry run changes canonical nodes,
   map old/new identities and verify translation and learner-state preservation
   in a disposable fixture plus bounded production inventory.
4. **Eligibility policy:** keep idiom-only and ordinary meaning exercises
   separate; do not use an ingestion fallback to decide the product's idiom
   mode.

## Follow-up to parent issues

- [#195](https://github.com/vbalashi/2000nl/issues/195) should treat the two
  `drop` records as a confirmed parser/source-classification case, while the
  wider false-positive categories remain an explicit research/repair scope.
- [#332](https://github.com/vbalashi/2000nl/issues/332) should not assume that
  every `idiom` node has an explanation. The corpus currently has 2,374 with
  explanations and exactly 2 explanation-less records whose source marker says
  `voorbeelden`; their exercise treatment must wait for the parser repair
  decision.

## #339 parser rule and dry-run evidence

Issue [#339](https://github.com/vbalashi/2000nl/issues/339) implements the
source-only correction after scanning every `f0c` block nested in the parsed
`f3u` meanings of the complete versioned manifest. The parser now classifies a
block as a meaning example only when the preceding sibling section link says
`voorbeelden`, the block has a nonblank `f3i` expression, and it has neither an
`f3n` explanation nor a nested `f2s` example. Explained blocks remain idioms,
including those under the same `voorbeelden` section. Example-only meanings are
retained rather than discarded.

The read-only audit is reproducible with:

```sh
python packages/ingestion/scripts/audit_vandale_classification.py \
  --data-dir /path/to/versioned/words_content
```

Against manifest
`45fc68e1dee018f3e778d88ec22d7805fb90588b1d1dacd226e3ae6024b621ce`,
the audit reported:

| Measure | Result |
|---|---:|
| Artifacts parsed | 18,163 |
| Parse failures | 0 |
| Source `f0c` blocks | 5,262 |
| Blocks with explanations | 5,260 |
| Blocks with nested examples | 2,884 |
| Bare blocks under `voorbeelden` | 2 |
| Bare blocks outside `voorbeelden` | 0 |
| Changed artifacts | 1 |

The false-positive guard report classified only the 2 bare `voorbeelden`
blocks. It retained all 5,260 blocks with explanations and all 2,884 blocks
with nested examples as idiom/expression structures; there were no bare blocks
outside a `voorbeelden` section in this manifest. The machine-readable audit
also emits all six observed shape variants so a future layout change cannot be
hidden by aggregate counts.

The single changed artifact is `003081_a3045_drop_zn_1.json`. Entry identity is
unchanged:

- provider article: `a3045`;
- source index: `3081`;
- sense ordinal: `1`;
- source entry key:
  `fnt:vandale-provider-article-v1:6ede8138ab47c0bc35156dea4753f6b0:1`.

Its semantic fingerprint changes from
`87fb3af13b29792a0ea5d58c7a2c5325a2c8bf386a4910e8007a74896d4621de`
to
`9f4726101b026171bb71dff91dd6532949a906980538f38c92475314f88bebe8`.
The definition node and fingerprint stay unchanged. The two source texts are
unique within the entry, so the dry run maps their old and new semantic nodes
without ambiguity:

| Text | Before | After |
|---|---|---|
| `zoete en zoute drop` | `idiom`, `raw.meanings[0].idioms[0]`, `476a26a4…` | `example`, `raw.meanings[0].examples[0]`, `3bab6fb7…` |
| `een dropje nemen` | `idiom`, `raw.meanings[0].idioms[1]`, `86b3c5b6…` | `example`, `raw.meanings[0].examples[1]`, `b1198d06…` |

Those node fingerprints are intentionally different because kind is part of
the fingerprint. This dry run therefore does not authorize direct import: a
future data operation must preserve the entry binding and explicitly reconcile
or retire the two old node identities plus any translations attached to them.
No artifact, database row, translation, FSRS state, or learner history was
mutated by this audit.
