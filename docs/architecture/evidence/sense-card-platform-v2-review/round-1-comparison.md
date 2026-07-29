# Round 1 Review Comparison

Both independent reviewers returned `ACCEPT WITH REQUIRED CHANGES`. Neither
reported a P0 or rejected the architecture direction.

## Agreement

| Topic | Review A | Review B | Round 1 disposition |
| --- | --- | --- | --- |
| V2 action boundary | A1 P1 | B1 P1 | accepted; add V2 actions and #89 gate |
| action/target typing | A5 P1 | B2 P1 | accepted; replace broad union |
| lookup completeness | A4 P1 | B4 P1 | accepted; group-atomic completeness |
| cross-reference/draft variants | A3 P1 | B5 P2 | accepted; severity resolved below |
| Word Details placeholder | A8 P2 | B7 P2 | accepted |
| operational rollback | A10 P2 | B8 P2 | accepted |

## Complementary Findings

These are not contradictions; one reviewer found a gap the other omitted.

| Finding | Source | Disposition |
| --- | --- | --- |
| requested `cardTypeId` is undefined | A2 P1 | accepted as a pre-#70 contract blocker |
| Known must be overlay plus active mark identity | A6 P1 | accepted as a pre-#70 contract blocker |
| duplicate-node reorder needs evidence qualification | A7 P2 | accepted during #70 binding implementation |
| AudioFilms label removal needs an explicit gate | A9 P2 | accepted during #70 consumer migration |
| non-source Headword Group lifecycle is undefined | B3 P1 | requires one product rule before plan revision |
| entry-level translation state is undefined | B6 P2 | accepted during #70 contract definition |
| mixed-POS header rule is incomplete | B9 P3 | resolve additively now; not a start blocker |

## Severity Disagreement

### Cross-reference and generated drafts

Review A classified the incomplete variants as P1 before #70; Review B
classified them P2 during #70 before route exposure.

Resolution: the architecture plan must define the discriminated ownership and
cardinality now, before #70 moves Ready. Exact field-level schemas and fixtures
remain #70 implementation work before route exposure. This removes the
ambiguity without forcing runtime implementation into #69.

## Required Plan Revision

Before the focused closure review:

1. add `/api/platform/v2/actions`;
2. require and echo the requested `cardTypeId`;
3. define user/generated Headword Group lifecycle;
4. define group-atomic lookup completeness and pagination;
5. replace capability unions with action-discriminated commands;
6. split scheduler state from `knownMark` and add mark identity/revision;
7. define cross-reference/draft cardinality and ownership;
8. qualify Content Node reorder guarantees;
9. define entry translation and minimum Word Details types;
10. make AudioFilms localization and deployment ordering explicit;
11. define mixed-POS fallback without client inference.

The revised package must receive a focused second review. No #70 implementation
starts before all revised P1 contract findings are closed.
