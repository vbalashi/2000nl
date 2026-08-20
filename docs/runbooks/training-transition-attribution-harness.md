# Training transition attribution harness

Issue: [#189](https://github.com/vbalashi/2000nl/issues/189)

This harness attributes Training entry, Learn, and review delays before any
product optimization. It runs an authenticated browser session against the
local Next.js app with deterministic, bounded route fixtures. It does not call
production or mutate production card state.

## Run

From `apps/ui`:

```bash
npm run test:e2e:training-attribution
```

The run performs 20 completed transitions at 1440×900 and another 20 at
390×844 through the local authenticated pilot/V2 path. Both Learn and review
must occur. It records:

- exact visible loading states and enabled Training controls with monotonic
  timestamps;
- bounded `2000nl:training-transition-timing` events with monotonic start/end
  intervals;
- transition IDs plus safe request IDs and sanitized `Server-Timing` when a
  response provides them;
- p50, p95, and max by stage;
- p50, p95, and max from the accepted Learn/review action to the next ready
  card under one transition ID;
- a separate Continue-session transition, including its exact loading and
  ready-control observations;
- correlated prefetch outcomes for every accepted transition, with deterministic
  fixture coverage of hit, miss, ordinary cancellation, and fallback;
- every event at or above the 1,000 ms diagnostic threshold, classified as
  auth, hydration, selection/scheduler, lookup, translation/audio preparation,
  mutation, network, or render;
- the exact Git HEAD and whether the tested worktree was dirty.

The JSON report is attached under the Playwright test output directory as
`training-transition-attribution.json`. The collector retains at most 2,048
timing events and 4,096 visible-state observations. It never captures request
or response bodies, auth headers, browser storage, or arbitrary headers.

## Prove the red path

The same scenario can split a deterministic injection across the action and
subsequent scheduler fallback on every tenth transition:

```bash
TRAINING_ATTRIBUTION_INJECT_DELAY_MS=1100 \
TRAINING_ATTRIBUTION_EXPECT=red \
npm run test:e2e:training-attribution
```

Each injected component remains below one second, while their sequential
end-to-end transition exceeds the threshold. The test passes only when the
resulting report says `red` and every event over the threshold has a supported
attribution category. Without injection, the default expected verdict is
`green`.

For a slow end-to-end transition, attribution clips same-transition component
intervals to the monotonic `transition.total` interval. The critical path walks
aggregate mutation, scheduler selection, preparation, and render intervals in
start-time and fixed stage-priority order. It attributes only the portion after
the last claimed endpoint, so nested or overlapping intervals are never summed.
Per-category observed duration is separately calculated as that category's
interval union; categories can overlap one another and therefore are evidence,
not values to add together. Nested action-request and network-transfer durations
remain diagnostic evidence but are not critical-path candidates. This local
timeline cannot infer server concurrency beyond the client-visible request
interval or distribute uninstrumented residual time among causes.

The platform prefetch client exclusively owns `next-card.prefetch/cancelled`
for an in-flight lookup. Hook cleanup owns the distinct
`next-card.preparation/cancelled` lifecycle event before aborting its controller.
Platform terminal outcomes are deduplicated per cached lookup, and the harness
preserves duplicate observations and asserts at most one cancellation from each
semantic layer per accepted transition.

## Scope

This is diagnosis infrastructure, not a benchmark of Supabase or production.
Use a production-safe, explicitly authorized observation run separately when
real backend percentiles are needed. Do not use this harness to justify FSRS,
scheduler, or loading-state behavior changes by itself.
