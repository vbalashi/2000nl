# DUCAME shortlist and component extraction notes

2026-10-19; #742 external pilot. Source inspection of the public [mwe-query 0.2.0a2 source distribution](https://pypi.org/project/mwe-query/0.2.0a2/) (SHA256 `68766096899220bb4b5e9fd953c58e7187f8ee216d2bd77d2abac21d1b565edf`). These notes describe upstream behavior, suggested safeguards and remaining caveats; no library code was installed or executed during this inspection. The earlier [availability report](LEXICON-ALTERNATIVES-RESEARCH-20261019.md) covers license and missing-cache issues.

## Strict matching without importing `indexes`

Relevant upstream modules are also visible in the [maintainer repository](https://github.com/CentreForDigitalHumanities/mwe-query), but findings here refer to the pinned alpha archive. Do not import `mwe_annotate` merely to obtain its small helpers: it imports `indexes`, which performs file writes and index-update work at import time.

A bounded adapter can use these narrower helpers after the main experiment's explicit compatibility setup:

1. `canonicalform.preprocess_MWE(canonical)` returns annotated words; preserve the original DUCAME canonical form and ID.
2. `canonicalform.generatequeries(canonical, mwetree=cached_canonical_parse)` returns **four** queries: strict expression, near miss, major-lemma/superset, related-word. The docstring still mentions three. Supplying `mwetree` avoids this function's fallback call to its imported parser.
3. `canonicalform.generatemwestructures(canonical, mwetree=cached_canonical_parse)` creates transformed canonical structure variants. Again supply the parse explicitly.
4. `canonicalform.expandfull(sentence_parse)` applies the input-side structural normalization used by upstream annotation.
5. Evaluate `expanded_sentence.xpath('.' + queries[0])` as upstream does. The matching node is a phrase/clause root; its complete descendant yield is **not** the expression's token membership.
6. For every canonical structure, expand its local alternatives with `alternatives.expandalternatives(structure)`. For each strict matching node and each expanded structure, use `getmwecomponents.getmwecomponents([match], [expanded_structure])` to extract lexicalized component nodes. Its narrower helper `getcompsxpaths(structure)` produces the component-relative XPath list directly.

`getmwecomponents.py` imports `.canonicalform` and treebank utilities, not `indexes`. `alternatives.py` likewise does not import `indexes`. This is not a guarantee that all transitive imports are side-effect-free; execute only in the isolated adapter whose import graph has been checked. The full `mwetypes.getmweclasses` can adjust component membership/classification, but imports additional lexical classifiers and is unnecessary for a first exact-boundary comparison. Label a component-helper adapter accurately rather than calling it byte-for-byte full upstream annotation.

## Token positions: preserve source identity

Component recognition follows annotated **structure paths**, not a bag of all matching lemmas. A canonical component is a node carrying `lemma`; unlexicalized argument placeholders need not be emitted. `getmwecomponents` creates component XPaths and requires every component path to produce a result. For repeated candidates it picks the first distinct node available for each path. It does not enumerate all valid one-to-one assignments. Upstream `getmweclasses` also chooses the first returned component list, so ambiguous repeated-word assignments are a real limitation.

The upstream position helper converts `@end` to an integer. For original one-token Alpino leaves with `[begin,end)`, `end` is the one-based token position. Map this back to the immutable original token ID/offset table; do not compute offsets against transformed words.

In particular, `wordtransform.transformsvpverb` inserts a synthetic particle for an unsplit particle verb. The synthetic particle and rewritten verb share the original `begin` and `end` but have different `subbegin` values. Thus two lexical components can legitimately map to one original source token. `expandfull` also substitutes index/reflexive structures, transforms pronominal adverbs and MWUs, and corrects lemmas. Keep original leaf IDs plus `(begin,end,subbegin,transformation)` provenance before collapsing membership to source-token sets. Do not report transformed particle words as literal source substrings.

Recommended conservative handling:

- Run each match/expanded-structure pair independently; retain all distinct component-source-token assignments, not only the first successful phrase root.
- Reject missing/invalid original-token mappings; flag synthetic components explicitly.
- If any component XPath admits multiple plausible leaves, mark assignment ambiguity or enumerate bounded compatible assignments. Do not claim deterministic exact boundaries from a greedy tie break.
- Deduplicate equivalent source-token sets per DUCAME ID after preserving provenance; separate distinct occurrences of the same expression.
- Keep overlapping/nested expression occurrences for evaluation. Upstream removes subsets and duplicates; applying that policy would be an extra experimental factor and may suppress useful learning material.

## Shortlist behavior and multiplicity

`mwe_annotate.annotate` constructs three alternative sentence-lemma views:

- Raw: every node with a `lemma` attribute, including particles.
- Adapted pronominal adverbs: `pronadvs.pronadv2vz` converts recognized fused forms to their associated preposition/circumposition components. An empty adaptation means retain the raw lemma. This view **replaces** affected lemmas; it is not an unconditional union of every analysis.
- Noun-compound heads: for `pt='n'`, take the suffix after the final underscore; other lemmas remain unchanged. It is a separate view, not a general split of all underscore lemmas. Joined verbal particle lemmas must not be treated as noun compounds.

It then collects candidate IDs through the supplied lemma postings, expands each required lemma containing `|` into alternatives, and tests required-lemma **multiset** inclusion. The `is_subset` helper uses `Counter`, so an expression requiring two occurrences of a lemma needs two occurrences in the sentence view. Replacing this with plain set inclusion broadens the shortlist incorrectly. `expandlemmas` computes Cartesian alternatives; repeated requirements still count separately.

Safe equivalent adapter logic is small: read the four-element index JSON as data; preserve string/int key conversion explicitly; union candidate IDs found by each sentence view; accept an ID only when at least one complete required-lemma alternative passes `Counter(required) <= Counter(view)`. Preserve per-view acceptance reasons. Cap Cartesian expansion or use a bounded matching implementation for unusually many alternatives; record truncation as incomplete search, not absence.

The packaged index's lemma inventory is itself derived from canonical parses and has a deliberate selectivity rule in `indexes.getlemmas`: after canonical transformations, prefer content lemmas when there are more than one, otherwise keep all lemmas; exclude `zullen`. Therefore an index hit is only a coarse necessary lexical signal. Do not rebuild required lemmas by stripping canonical text and assume equivalence. Normalization mismatch between input and index can create false negatives before structural matching.

## Semantic and evaluation caveats

Strict XPath success proves structural compatibility with a lexical entry, not that the occurrence has its idiomatic reading in this context. Near-miss and major-lemma matches are weaker review proposals and must retain their query type. Separately measure shortlist recall, parse failures, strict-match recall, source-boundary accuracy and contextual sense. A candidate lost before matching must not be blamed on the structural matcher.

For frozen evaluation, keep the shortlist automatic and blind to expected labels. Build canonical parse caches only from the resulting source-derived shortlist, or clearly label a hand-selected cache as a coverage-limited development control. Record candidate caps, alternative caps, unresolved mappings and cache misses. Do not score a technical unsupported case as an expression-free sentence. This allows useful comparison with LLM discovery while keeping limitations visible.
