# Approved article rhythm integration

Owner approved deployment on 2026-10-03 after reviewing Balanced/Airy, then requested that translation behavior in other sections be checked later.

The production article renderer now owns the accepted source leading 1.25, content translation leading 1.3, content pair 2/3, label/body 4/5, group 12/16 and nested horizontal inset 8px. Profiles derive these values from shared account settings. Both nested headings use normal flow and the same content inset. Main definition translation spacing remains 4/5; other translation behavior and partial-translation section selection are deferred.

Prototype CSS overrides were removed. The dev fixture route now exercises the real production styles. Historical before/after images under `docs/design/565-article-rhythm` remain snapshots of the decision, not a claim that the live dev route still implements two versions.

Validation:

- Typecheck and lint passed. Lint retains an unrelated existing handlePlayAudio dependency warning.
- 25 existing tests passed: shared article reading, idiom presentation, reading preferences and account spacing.
- 36 real-component gestalte checks and 48 rich goed/usage checks passed: no horizontal overflow, no clipped revealed translations, nested source/translation inset 8px and matching left axes.
- Independent CSS integration review confirmed the winning cascade and preservation of main-definition spacing.
- DB contract changes: none. Based on main `573fe8cf`, existing contract 203 is enabled and unchanged.

These are isolated fixture UI checks, not backend or learner-progress tests. All `/api/` and remote requests are blocked by capture scripts. No review ratings or preferences were written.

Reproduce from `apps/ui` with an isolated development server on 3111 and flags `NEXT_PUBLIC_SHARED_ARTICLE_PRESENTATION_V1=1` / `NEXT_PUBLIC_TRAINING_PRESENTATION_V1=1`. Set local placeholder Supabase URL/key; the fixture route does not contact the backend. Run:

```sh
RHYTHM_OUTPUT=../../docs/qa/565-article-rhythm-release RHYTHM_INSET_REVIEW=1 node scripts/capture-article-rhythm.mjs
RHYTHM_OUTPUT=../../docs/qa/565-article-rhythm-release node scripts/capture-rhythm-coverage.mjs
```

Current/proposed URL treatments have identical shared styles after absorption; the two labels are retained only for capture compatibility. The historical comparison is static.
