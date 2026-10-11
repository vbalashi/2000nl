# Translation reliability rollout order

Date: 2026-10-11. Status: accepted by owner. Follow-up to discussion 05 and #674.

The owner confirms that the latest production rollout successfully translated the previously failing card and the longest tested cards in one request using the current prompt. There is no observed need to split these cards now. This evidence concerns the tested cards; it does not prove every future source fits the bounded request.

Prioritize shared pending/recovery behavior, independent worker startup and health, the bounded latched-member preparation buffer, and end-to-end validation. Preserve the current full-context translation prompt and budgets. Semantic partitioning and durable partial results are deferred follow-up scope, not a prerequisite for this rollout and not implemented by the queue work. Whole-source completeness remains distinct from selected-request completeness.

Keep queue execution disabled until the worker lifecycle, client pending behavior and release/rollback checks are integrated and validated.
