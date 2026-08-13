# Pointer meaning characterization for issue 151

Date: 2026-08-13

The local Van Dale structured corpus contained 17,959 entry artifacts. A
deterministic, filename-sorted sample of the first 5,000 artifacts was audited
with:

```text
python packages/ingestion/scripts/audit_pointer_meanings.py \
  <vandale-words-content-directory> --limit 5000
```

The sample contained 98 definitions with a literal hyphen. Only four had the
pointer-only shape: one exact non-whitespace token ending in `-`, with no
context, examples, idioms, relations, notes, labels, or grammar, and with a
separate target headword present in the corpus. The other 94 were classified
as hyphenated content and are not redirects.

The four resolvable pointer-only records were `daar` meaning 2 -> `daar-`,
`er` meaning 4 -> `er-`, `erbij` meaning 1 -> `er-`, and `erop` meaning 1 ->
`er-`. No unresolved pointer-shaped token occurred in the bounded sample.

For the reported case, `daar` meaning 2 contained only the definition
`daar-`. The separate `daar-` entry contained the definition “samen met een
voorzetsel gebruikt om iets te zeggen over een onderwerp van gesprek; soms
staat ‘daar’ los van het voorzetsel” and four examples.

## Ownership decision

The source generation/ingestion boundary owns this distinction. It has the
whole source corpus needed to prove that an exact target exists and can emit
the already-supported `cross_reference` contract with no local meanings.
Projection continues to consume explicit lexical semantics; it does not infer
redirects from definition punctuation.

The committed audit output is in [audit-5000.json](./audit-5000.json).

## Full-corpus release audit

Before release, the same audit was repeated without a sample limit across all
17,959 artifacts. It classified 186 records as ordinary hyphenated content,
six as resolvable pointer-only records, and none as an unresolved
pointer-shaped record. The two additional records outside the bounded sample
were `hier` meaning 2 ->
`hier-` and `waar` meaning 2 -> `waar-`.

A clean regeneration from the source list produced 18,163 entries with
`vandale-structured-v2` format and the `vandale-provider-article-v1` identity
scheme. The six audited records were emitted with an explicit
`cross_reference`, an empty meanings list, and the expected target. This is the
release gate for importing the regenerated corpus after compatible application
code is deployed.

The full result is committed in [audit-full.json](./audit-full.json).

## Production-like upgrade rehearsal

The release candidate was rehearsed on 2026-08-13 against a fresh local
Supabase schema using the currently deployed corpus first, followed by the
regenerated corpus:

- current manifest: `45fc68e1dee018f3e778d88ec22d7805fb90588b1d1dacd226e3ae6024b621ce`;
- regenerated manifest: `53496b238a88473891ecedd4a1f95151a05383d39c7a51d333bdb48a6e69b08b`;
- both manifests contain 18,163 artifacts and share input checksum
  `1d9236554fd35f49ca9fa274045d84a5ee3ea04035a85f89a21391878b685173`;
- upgrading reported 0 inserts and exactly 6 UUID-preserving updates;
- the six before/after entry UUID lists were byte-identical;
- all six updated rows had the expected top-level `cross_reference` and an
  empty meanings array;
- representative ordinary hyphenated definitions (`aanhef`, `AIVD`, and
  `audioapparatuur`) remained ordinary definitions;
- word-form regeneration produced 68,102 rows with no missing headword;
- replaying the regenerated manifest verified all 18,163 artifacts as a true
  no-op;
- local schema probes and 78 DB/RPC tests passed.

This rehearsal validates the content-only upgrade path used by the production
runbook. It does not replace the fresh production backup or the post-import
Library and Training smoke.
