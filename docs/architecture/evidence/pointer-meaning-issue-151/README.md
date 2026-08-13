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
