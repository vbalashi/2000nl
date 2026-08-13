# Issue 150 idiom hierarchy evidence

Date: 2026-08-13
Issue: https://github.com/vbalashi/2000nl/issues/150

## Exact reproduction

The corpus-backed fixture in
`apps/ui/tests/platformV2IdiomHierarchyFixture.ts` contains the two reported
cases and intentionally reverses the Platform V2 `contentNodes` wire order.

- `nodig` has two idiom expressions and two explanations. Before the fix,
  Training flattened all four nodes into the idiom section and reported a
  count of four.
- `goed` contains `iets komt ten goede aan iemand of iets`, its explanation,
  and the nested example about proceeds benefiting fire victims. Before the
  fix, Training discarded the two child relationships.

The red feedback loop was:

```text
cd apps/ui
npm test -- tests/trainingSenseCardV2Model.test.ts
```

Before the implementation, two literal regressions failed: `nodig` idioms had
no children, and the reordered `goed` expression contained neither its
explanation nor example.

## Root cause and correction

Platform V2 already projected `parentContentNodeId`, and Library already used a
two-pass ID map. Training copied only node ID, kind, text, and translation into
its view model, then classified the resulting flat list. The section count was
therefore the number of expression and explanation nodes rather than the
number of root idiom expressions.

Training now builds the same ID-owned tree before classifying visible root
sections. The renderer recursively displays children, uses plain explanatory
typography for `idiom-explanation`, retains quotation-style typography for the
expression and nested example, and exposes node/parent IDs as semantic DOM
metadata. Library exposes the same metadata without changing its card layout.

No unrelated card anatomy, controls, section ordering, or action placement was
changed.

## Cross-surface evidence

| Surface | Evidence |
| --- | --- |
| Platform V2 | Shuffled bindings still project the exact `goed` parent IDs; report capabilities independently target expression, explanation, and example node IDs. |
| Library model | Reversed node order still rebuilds the exact `goed` expression with two children. |
| Library renderer | Explanation and example remain DOM descendants of the expression; explanation typography is non-italic. |
| Training model | The exact `nodig` fixture exposes two root idioms, each with its own explanation; reordered `goed` retains both children. |
| Training renderer | The idiom header reports `2`; expression/example are italic, explanation is explanatory non-italic text. |

## Validation

```text
cd apps/ui
npm run typecheck
npm test -- tests/platformSenseCardV2Projection.test.ts tests/librarySenseCardModel.test.ts tests/LibrarySenseCardGroup.test.tsx tests/trainingSenseCardV2Model.test.ts tests/TrainingSenseCardStage.test.tsx tests/platformV2ConsumerContract.test.ts tests/platformV2TrainingClient.test.ts tests/platformV2LibraryClient.test.ts
```

Result: typecheck passed; 66 focused tests passed across Platform V2, Library,
Training, and both consumer contracts.

The final full UI regression also passed: 65 test files passed, 2 database-only
files were skipped by the normal UI command, 517 tests passed, and 76 were
skipped. `npm run lint` completed with no warnings or errors.
