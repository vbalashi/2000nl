# Saved training metadata

Accepted 2026-10-03, issue #573. Projection owns presentation; scheduler filters and saved recipes do not carry visibility flags.

| Exercise | Directions in subtitle | Selection | Size |
|---|---|---|---|
| Words | Direct / Reverse / Direct + Reverse | New only / Reviews only / New + reviews | N exercises / All due |
| Idioms | Direct / Reverse / Direct + Reverse | New only / Reviews only / New + reviews | N exercises |
| Translation (context recall) | Omitted: one supported direction | New only / Reviews only / New + reviews | N exercises |
| Sentence translation, paused | Omitted | Selection retained | Size retained; cannot start |

Hero description: exercise, direction if applicable, selection. Saved row: language, the same description, size. Recipe name stands separately; dictionary names and detailed filters are available in Edit, avoiding an indefinitely growing subtitle. Long names/text wrap in the existing min-width-zero row; do not truncate important selection/size metadata.

Capability table is centralized in `setups/metadata.ts`; translated labels are derived in one pure formatter. Test matrix covers English/Dutch/Russian, three live families, all directions, all selection modes, bounded/unbounded size (162 combinations; invalid family/size combinations are renderer robustness checks, not new supported configurations).

Highlighted identity is a user-scoped browser preference, independent of main recipe setting and accepted session. Deleted identity falls back to main then first available saved recipe. Every saved recipe stays in Saved, even when highlighted. Synthetic session/current setup projections never count as saved recipes.

Only an accepted session with remaining work gets Continue/In progress. Empty planner output is reported inline on the selected recipe; it is not accepted/persisted as a resumable session. Reviews-only empty copy says “now”, not “today”, because no end-of-day schedule projection was queried. Review ahead explicitly uses early timing, same filters, reviews only; saved recipe is unchanged.
