# Translation loading: current server contract

2026-10-13, issue #692. Code inspection and deterministic tests, not production fault injection.

## What is actually partial

`dictionaryTranslationJobExecutor.ts` plans bounded provider parts, reuses valid saved parts, executes the next missing part, checkpoints it and yields with `{continuation:true}`. Only a complete aggregate returns an overlay for publication. `dictionaryTranslationJobWorker.ts` calls the completion RPC only for that full result.

Migration 224 checkpoints parts in `dictionary_translation_job_parts`, which is inaccessible to browser roles. It does not update `word_entry_translations`. Migration 223 publishes the aggregate and completes the job in one transaction. Retryable failures remain queued (5/20-second backoff) until attempts are exhausted; only then does the public job status become failed.

`dictionaryMeaningTranslationRequestService.ts` returns pending + job identity, or confirmed failed + safe error. Neither contains checkpoint translations nor per-field failure IDs. The ready response contains the full cached overlay.

## UI implications

- Previously projected fresh translations can coexist with missing fields during a repair. Preserve them throughout loading and failure.
- A newly translated part is not progressively visible in the current contract.
- Pending, retry backoff, transient transport interruption and observation expiry remain pending. The visible Training observer resumes after its five-minute window without a total wall-clock failure threshold.
- Confirmed job failure replaces placeholders only in missing fields. These messages identify unavailable display locations, not provider failure attribution.
- Any inline Retry retries the value's job. Saved successful parts are reused; it does not independently retry one display field.
- No DB migration, provider prompt change or streaming contract was introduced.

## Reproducible evidence

Run from apps/ui:

`npm test -- --run tests/dictionaryTranslationJobExecutor.test.ts tests/dictionaryMeaningTranslationRequestService.test.ts tests/dictionaryTranslationObservation.test.ts tests/usePlatformV2TranslationPreparation.test.ts tests/translationFeedback.test.tsx`

The executor's `worker resumes durable parts after a failed part, then publishes only full aggregate` test saves part one, injects a provider error into the next part, checks the saved part survives and is not translated again, then verifies full coverage after recovery. RPC/database behavior is mocked here; the publication/access guarantees above were also inspected in migrations 223/224, not re-executed against production.

The request characterization test verifies queued retry with a pre-existing incomplete cache returns pending with no overlay/field errors, and the third-attempt terminal failure returns failed. Observation tests cover timeout/network/429/5xx without declaring job failure. Hook tests cover resumed observation after more than a minute, cancellation and explicit retry. Rendering tests locate failure inside the missing definition while a ready field remains unchanged.

## Visual evidence

`/dev/sense-card-gate?prototype=translation-feedback` uses actual production article components with controlled fixture data/job states. This is a mocked-data UI capture, not an end-to-end provider integration. Retry resolves the entire fixture after three seconds, matching aggregate publication. The gate is unavailable in production. Checked expanded/collapsed states, ready equivalent above definition, pending -> failure -> retry -> ready, and light/dark palettes.
