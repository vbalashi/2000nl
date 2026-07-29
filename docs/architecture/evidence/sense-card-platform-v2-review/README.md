# SenseCard Platform V2 Architecture Review Packet

Status: accepted review record for issue #69
Revision date: 2026-07-29

Both reviewers receive this same packet. They may inspect the referenced
files, but they review the same plan revision and evidence baseline. Their
findings are compared by claim and evidence; severities are not averaged.

Round 1 artifacts:

- [review A](review-a.md);
- [review B](review-b.md);
- [comparison and accepted corrections](round-1-comparison.md).

Revision 2 closure artifacts:

- [closure review A](closure-review-a.md);
- [closure review B](closure-review-b.md);
- [comparison and revision-3 corrections](closure-comparison.md).

Final revision 3 artifacts:

- [final review A](final-review-a.md);
- [final review B](final-review-b.md);
- [final comparison](final-comparison.md).

## Review Target

- [SenseCard Platform V2 Contract Plan](../../sense-card-platform-v2-contract-plan.md)
- [ADR 0004](../../../adr/0004-sensecard-presentation-contract-boundary.md)
- [Project vocabulary](../../../../CONTEXT.md)

## Integrated 2000NL Baseline

- repository: `vbalashi/2000nl`
- commit: `d65909f78597e40c883b5df152a2eaba06c7e5d6`
- #68 frozen SenseCard specification:
  [`../../sense-card-visual-spec-v1.md`](../../sense-card-visual-spec-v1.md)
- #71 real-data/contract audit:
  [`../../sense-card-real-data-contract-audit.md`](../../sense-card-real-data-contract-audit.md)
- #86 parser-v2/source-binding integration and production cutover: merged
  through PR #88
- source identity decision:
  [`../../../adr/0003-versioned-source-entry-bindings.md`](../../../adr/0003-versioned-source-entry-bindings.md)
- current public contract:
  [`../../../reference/platform-api.md`](../../../reference/platform-api.md)
- current shared types:
  `packages/shared/types/platform.ts`
- current projection:
  `apps/ui/lib/platform/projections/dictionaryContent.ts`
- current lookup/action orchestration:
  `apps/ui/lib/platform/platformApi.ts`

## AudioFilms Read-Only Baseline

- repository: `vbalashi/audiofilms`
- inspected commit:
  `978e7c97d2ac5502a84b0bc7ef2ce78325d1ed8a`
- branch at inspection: `codex/youtube-content-refactor`
- unrelated untracked design notes and `.stfolder` were not used or modified
- architecture: `/Users/khrustal/dev/audiofilms/ARCHITECTURE.md`
- external-client principles:
  `/Users/khrustal/dev/audiofilms/docs/architecture/external-learning-client-principles.md`
- transition projection:
  `/Users/khrustal/dev/audiofilms/app/src/lib/dictionary/overlayProjection.ts`
- consumer types:
  `/Users/khrustal/dev/audiofilms/app/src/types/dictionary.ts`
- provider compatibility path:
  `/Users/khrustal/dev/audiofilms/app/src/lib/providers/dictionary/TwoThousandNlDictionaryProvider.ts`
- Wave 0 seam evidence:
  `/Users/khrustal/dev/audiofilms/docs/intent/audiofilms-dictionary-wave-0-contract-evidence.md`

## Visual Evidence

- Pen file:
  `/Users/khrustal/dev/pens/2000nl-audiofilms.pen`
- approved reference node IDs: `T7XiZB`, `CeEod`, `rPDYL`
- canonical visual rules are written in
  `docs/architecture/sense-card-visual-spec-v1.md`; reviewers should not derive
  contract semantics from unapproved or archived Pen boards.

## Product Decisions Recorded During The Grill

1. Platform returns an opaque `headwordGroupId`; clients never group by visible
   headword/POS/order.
2. Content Nodes have durable server-issued IDs that survive harmless reorder.
3. Platform V2 uses explicit routes; V1 existing representable states remain
   unchanged, with a fail-closed interoperability guard for active V2 Known
   Marks.
4. Known is reversible database state, not `easy`; undo restores preserved
   state and keeps action history.
5. Default SenseCard remains compact; Word Details, personal overrides, and
   structured feedback remain separately owned by #84, #87, and #51.
6. Every initial user-created/copied/generated-saved entry receives its own
   private durable Headword Group. Edits and renames preserve it; automatic
   grouping by text is prohibited.

## Round 1 Corrections Requiring Closure

- explicit `/api/platform/v2/actions`, gated on #89;
- required/echoed `cardTypeId`;
- group-atomic pagination and completeness;
- durable private group lifecycle for user/generated entries;
- Known overlay with active mark identity and revision;
- action-discriminated targets and mutation idempotency;
- complete cross-reference and generated-draft ownership/cardinality;
- evidence-qualified duplicate-node reconciliation;
- typed entry translation and minimum Word Details projection;
- mixed-POS fallback without client inference;
- explicit AudioFilms localization gate and deployment/rollback matrix.

Revision 3 additionally closes:

- one-to-one private-group backfill for existing user entries;
- canonical-payload idempotency and generated-save retry identity;
- active-Known safety during consumer rollback to V1;
- frozen `source-context-v2` plus atomic action/provenance persistence.

## Baseline Gaps The Plan Addresses

- position-derived section IDs and translations;
- public `raw` and AudioFilms compatibility fallbacks;
- absent projection for parser-v2 rich structure;
- source fingerprint mislabeled as translation policy version;
- V1 Known action semantics contradicting frozen UX;
- labels embedded in AudioFilms action descriptors;
- no public Headword Group object;
- no durable Content Node binding store;
- no V2 route family.

## Required Review Questions

1. Does the plan keep one authoritative owner for identity, content,
   translation, learning state, and actions?
2. Is durable Content Node identity justified and minimally scoped?
3. Can group identity represent source homographs, user entries, generated
   drafts, and multiple dictionaries without client inference?
4. Are V1 coexistence, V2 rollout, and post-exposure rollback safe?
5. Are action targets and Known/undo semantics transactionally coherent?
6. Does localization avoid both backend-visible labels and duplicated product
   semantics?
7. Is the base-card / Word Details / personal-overlay boundary deep enough
   without speculative fields?
8. Can AudioFilms keep its backend adapter and independent renderer without
   reintroducing Platform inference?
9. Are cross-reference-only entries and dictionary search results prevented
   from becoming false learning cards?
10. Which findings are true blockers before #70 versus separately owned
    follow-ups?

## Required Review Output

For every finding:

- severity: P0, P1, P2, or P3;
- exact violated invariant or unsafe scenario;
- evidence;
- smallest required change;
- owner and timing: before #70, during #70, or tracked follow-up.

The reviewer must end with one verdict:

- `ACCEPT`;
- `ACCEPT WITH REQUIRED CHANGES`;
- `REJECT`.

No implementation edits are part of the review.
