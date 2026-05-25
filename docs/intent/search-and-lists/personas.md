# Search And Lists Personas And Roles

Last updated: 2026-05-25
Status: Draft

## Purpose

This document defines working user types for search, lists, and training. These
are not marketing personas. They are product roles used to test whether a
workflow makes sense for different usage patterns.

Do not invent detailed biographies unless they clarify product behavior. Prefer
roles, goals, constraints, and scenario relevance.

## Working Roles

| Role | Primary goal | Typical behavior | Product risk |
|---|---|---|---|
| Single-language learner | Learn Dutch vocabulary consistently. | Searches words, adds useful entries, trains the active list. | UI becomes too complex for the main learning loop. |
| Lookup-first user | Understand words quickly without necessarily training them. | Searches meanings, examples, translations, and source details. | Training/list actions clutter lookup and obscure definitions. |
| Card-training user | Complete review sessions with minimal setup friction. | Opens the app to train due/new cards, changes scope rarely. | Search/list management interrupts the training loop. |
| Multi-language learner | Learn or inspect words across more than one language/source. | Switches language/source scopes and may maintain multiple lists. | "Active list" and dictionary scope become ambiguous across languages. |
| List curator | Builds and maintains word collections. | Searches, filters, sorts, selects, adds/removes entries. | List management is too weak or too similar to dictionary search. |
| Teacher/coach | Creates or manages learning material for others. | Curates lists for students, may need sharing/export/review workflows. | Teacher workflows distort the solo learner product before they are truly supported. |

## Role Priority

Current first-party product priority:

1. Single-language learner.
2. Card-training user.
3. Lookup-first user.
4. List curator.
5. Multi-language learner.
6. Teacher/coach.

This priority is provisional. It should be revisited when the product starts
building explicit multi-language, sharing, classroom, or team functionality.

## Scenario Mapping Rules

- Every scenario must name its primary role.
- A scenario may list secondary roles when the same flow must work for multiple
  usage patterns.
- Do not optimize a flow for all roles equally unless the product explicitly
  decides that the scenario is cross-role core behavior.
- If a role needs different system behavior, document it as a scenario variant
  rather than hiding it inside a generic requirement.
- Teacher/coach scenarios should be marked future-facing unless the current app
  already supports the needed ownership, sharing, or student-management model.

## Open Questions

- Is the current app primarily a solo learning app, or is it already intended to
  become a broader dictionary-backed learning platform?
- Should lookup-only use be treated as a first-class success path or as a
  support path for training?
- When multi-language support expands, should language be a global context, a
  per-list property, or a search/list filter?
- Are teacher/coach workflows in scope for near-term UX, or should they remain
  future platform intent?
