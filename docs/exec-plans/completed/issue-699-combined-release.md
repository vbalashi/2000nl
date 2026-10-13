# Issue #699 — combined release verified

Released on 2026-10-13 through [PR #700](https://github.com/vbalashi/2000nl/pull/700).

Included exact reviewed heads from #689, #691, #695, #697, #698 and #682.
The documentation conflicts preserved all accepted decisions and the already
released full-source translation contract. Research PRs #658, #662, #666, #668
and draft article #678 remain separate and unpublished.

Full CI found two stale client expectations. Preparation now retains a healthy
lookup while translation is pending or failed, preloads audio independently,
and refreshes only when the aggregate is ready. Unknown/transient gateway
responses remain pending; an explicit failed job is terminal.

## Evidence

- Independent Standards and Spec reviews: no blocking findings; final client fix reviewed again.
- UI CI 38454495668: 2353 unit tests, 182 platform smoke tests, 221 ordinary and 29 pilot browser tests, 17 reliability browser tests passed. Smoke tests overlap the unit selection.
- Disposable DB validation: 376 FSRS/RPC tests passed; database drift, security and release boundaries passed.
- Contract manifest and local migration 225/chained postflight passed.
- [Deployment 38456265675](https://github.com/vbalashi/2000nl/actions/runs/38456265675): success.
- Production deep health at 19:42 UTC: version **0.18.1305**, exact commit **2c8ce2b0215a08b79bbf0c49864f7e0b67c4ea11**, status ok; expected and actual **2000nl-db-225**; translation worker enabled and ok.
- Reference main synchronized to the deployment commit. This documentation checkpoint is separate from the deployed application commit.

## Checkout checkpoint

The completed #692 checkout can retire after its clean/ancestry/process audit;
its branch and merged PR #695 retain recovery history, with screenshots outside
the checkout. #699 remains active for the local 3100 demonstration. Other source
checkouts are preserved: #680 is dirty, #688 owns private recovery evidence, and
#690/#693/#696 have unknown session ownership. No research checkout is retired.
