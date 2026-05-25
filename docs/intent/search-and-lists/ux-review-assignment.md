# UX Review Assignment: Search, Lists, And Training Scenarios

Date: 2026-05-25
Project: 2000nl
Review type: User-scenario and product-model review

## Context

We documented the intended behavior for dictionary search, word lists, list
membership, and training entry points before implementing UI changes.

The current work is a scenario audit, not a visual design proposal. The next
engineering step depends on whether the scenarios, object boundaries, and UX
requirements are correct enough to implement.

## Review Goal

Please review the provided scenario set from a senior UX/product-design point
of view.

Focus on whether the user scenarios are complete, coherent, and correctly
separate these product concepts:

- dictionary lookup scope;
- viewed list scope;
- list membership;
- active training scope;
- one-entry training behavior;
- curated lists, user-owned lists, and dictionary source lists.

Do not spend time on high-fidelity visual design. We need scenario coverage,
product semantics, missing states, and implementation readiness.

## Included Materials

- `index.md` - intent map and current scenario index.
- `personas.md` - working user roles.
- `current-ux-gap-report.md` - current cross-scenario UX gap summary.
- `scenarios/_template.md` - scenario format.
- `scenarios/find-word-add-to-list.md`
- `scenarios/find-word-understand.md`
- `scenarios/manage-list-words.md`
- `scenarios/choose-training-scope.md`
- `scenarios/train-one-entry-now.md`
- `scenarios/inspect-entry-membership.md`

## Questions To Answer

1. Are the six starter scenarios the right set for this product area?
2. Are any important user scenarios, roles, states, or edge cases missing?
3. Are the role priorities in `personas.md` appropriate for this work?
4. Are lookup, list management, membership, and training scope separated
   correctly?
5. Are any current assumptions wrong or risky?
6. Which open product questions must be answered before implementation?
7. Which requirements are mandatory for the first UI fix, and which can wait?
8. Is the suggested execution order in `current-ux-gap-report.md` right?

## Required Return Format

Preferred return format: one markdown file named `ux-review-response.md`.

Please use this structure:

```md
# UX Review Response: Search, Lists, And Training

## Decision

Approved / Approved with required changes / Blocked

One short paragraph explaining the decision.

## Coverage Verdict

- Covered well:
- Missing or underdefined:
- Over-scoped or premature:

## Scenario-by-scenario Feedback

### scenarios/find-word-add-to-list.md

- Keep:
- Change:
- Missing:
- Implementation blockers:

### scenarios/find-word-understand.md

- Keep:
- Change:
- Missing:
- Implementation blockers:

### scenarios/manage-list-words.md

- Keep:
- Change:
- Missing:
- Implementation blockers:

### scenarios/choose-training-scope.md

- Keep:
- Change:
- Missing:
- Implementation blockers:

### scenarios/train-one-entry-now.md

- Keep:
- Change:
- Missing:
- Implementation blockers:

### scenarios/inspect-entry-membership.md

- Keep:
- Change:
- Missing:
- Implementation blockers:

## Missing Scenarios Or States

List any scenario files or state tables that should be added before design or
engineering starts.

## Product Model Corrections

Call out terminology or object-boundary changes. In particular, address:

- dictionary source versus list membership;
- viewed list versus active training list;
- save/list membership versus learning progress;
- one-entry training versus normal training queue.

## Open Questions And Recommendations

| Question | Recommendation | Must answer before implementation? |
|---|---|---|
| ... | ... | Yes / No |

## First Implementation Slice

Recommend the first UI/engineering slice to implement, including the exact user
outcome it should prove.

## Optional Rewrites

If you want to rewrite specific scenario sections, paste only the replacement
sections here and include the target file path and heading.
```

## Optional Return Package

If you prefer to edit files directly, return a zip with this structure:

```text
ux-review-response.md
revised-docs/
  index.md
  personas.md
  current-ux-gap-report.md
  scenarios/
    ...
change-notes.md
```

Even if you return revised docs, include `ux-review-response.md` so engineering
can quickly understand the decision, blockers, and first implementation slice.

## Review Standard

Please be direct. Mark issues as blockers only when implementation would likely
create the wrong product model or force significant rework. For smaller issues,
classify them as required change, recommended change, or defer.
