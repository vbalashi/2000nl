# Issue 189 — Training transition attribution evidence

Base: `c06e6fe18b82ede1350513564f95fc5e446e7dbf`

Scope is limited to transition instrumentation, safe response attribution,
the deterministic authenticated harness, tests, and this evidence. No DB
migration, scheduler/FSRS semantic change, report implementation, #143, or
draft PR #144 content is included.

## Red-capable feedback loop

The focused loop was first run against the unchanged implementation after the
new assertions were added:

```bash
npm test -- tests/trainingTransitionTiming.test.ts \
  tests/platformV2TrainingClient.test.ts \
  tests/useTrainingTurnController.test.tsx
```

It failed five exact assertions: unsafe raw `Server-Timing`, absent action
response correlation, absent accepted prefetch hit/miss outcome, and a broken
transition identity between selection and preparation. After implementation,
the same loop passed 36/36 tests.

## Browser verification

The green browser run performed 20 completed user transitions per viewport
through the authenticated pilot/V2 path:

- desktop 1440×900: 20 distinct completed transition IDs (1 Learn and 19
  review);
- mobile 390×844: 20 distinct completed transition IDs (1 Learn and 19
  review);
- both profiles included auth, preferences, active-scope and scenario
  hydration, scheduler selection, prefetch, lookup, cached translation, audio,
  action request, aggregate mutation, network, render, and end-to-end timing;
- every V2 lookup/audio/action fixture response carried a safe `x-request-id`
  and sanitized `Server-Timing` evidence;
- each profile measured a separate Continue-session transition with the exact
  visible `Загрузка карточки…` → hidden → `Показать ответ` progression;
- every accepted transition carries its own prefetch outcome list, and the
  deterministic set covers hit, miss, ordinary cancellation, and fallback;
- both profiles: no event reached the 1,000 ms threshold and no event was
  unclassified;
- visible ready controls were timestamped from first `Antwoord Tonen`, through
  `Begin met leren`, to the review controls.

The red proof used `TRAINING_ATTRIBUTION_INJECT_DELAY_MS=1100` and
`TRAINING_ATTRIBUTION_EXPECT=red`. The fixture split the injection into two
sequential roughly 605 ms stages. Neither component crossed the one-second
threshold, while the accepted-action-to-ready `transition.total` reached about
1.24 seconds and produced a classified red verdict. This specifically proves
that a slow sum of individually sub-threshold stages cannot remain green.
The slow totals are attributed to an interval-clipped monotonic critical path
led by mutation plus scheduler selection. Overlapping aggregate intervals only
contribute their previously unclaimed portion; nested network evidence is a
separate per-category interval union and is not double-counted into that path.
The platform prefetch client is the sole owner of an in-flight lookup's
`next-card.prefetch/cancelled` terminal event; hook cleanup uses the distinct
`next-card.preparation/cancelled` stage, so the two semantic layers cannot
produce indistinguishable duplicates.

These deterministic route-fixture results prove the attribution harness, not
production latency. A production observation remains a separate rollout/QA
activity and must not mutate learner state merely to collect diagnostics.
