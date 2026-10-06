# Selected training availability

The overview is scoped to the selected saved recipe and owner. Unknown counts stay unknown.

`Due now` is the actionable review backlog: eligible introduced FSRS cards whose `next_review_at` is at or before the server reference time, including overdue cards. Future repetitions later in the study day belong only to `Total reviews`. Study-day metadata retains the local 04:00 boundary. Counts are uncapped by session size.

For Reviews only, a zero due-now count and a positive review total offer Review ahead immediately. A positive due count offers Start training. New-only and mixed recipes retain their new-card checks. Launch remains authoritative if cached counts become stale; an empty result may override the cached action. Explicit Review ahead retains its existing session-only flag and FSRS behavior.

Migration 210 replaces only the read aggregate cutoff. It does not reschedule cards or broaden normal session selection. Its versioned postflight replaces the historical day-end aggregate probe while retaining auth, eligibility, grants and contextual-index guards.

Reviews only includes both mature due reviews and due short-interval learning cards. It excludes new introductions and future repetitions. Migration 211 corrects the unfiltered scheduler branch that previously classified due learning as practice in Reviews only. Translation uses ordinary reverse identity with contextual example eligibility, so its regression must compare overview counts against an actual contextual start plan at a short learning interval.

## Transient read recovery

Selected recipe availability retries transient read failures without exposing an intermediate error: at most three attempts, 15 seconds per attempt, with 500ms and 1500ms delays. The outer UI deadline is 50 seconds. Network failures, per-attempt timeouts, HTTP408/429/5xx are retryable; authorization, invalid recipe, and invalid successful payloads are terminal. Existing loading or cached-value refreshing state remains visible until success or exhaustion. Scope change, account change and unmount cancel the request and backoff; responses from an old scope cannot update the new recipe. Manual Retry remains available after exhaustion. No background polling or retrying training mutations is introduced.
