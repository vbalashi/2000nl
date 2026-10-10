# Translation provider attempts and recovery

Owner: `apps/ui/lib/translation/openaiTranslator.ts` and `translationRetry.ts`.
Accepted decision: [2026-10-10](../discussions/2026-10-10-05-translation-retries-and-diagnostics.md).

Search server logs for `[translation] attempt`, group by correlationId and order
by attempt. Each ordinary translation has one attempt. Temporary HTTP429/5xx,
timeout or network errors allow up to3 further attempts with300/600/1200ms
backoff; Retry-After is bounded30s. A fourth failed attempt has retry:false.
Permanent4xx and malformed/empty/incomplete/contract-invalid outputs terminate
without blind regeneration; configured provider fallback remains separate.

Read stage (request / response / contract), reason (closed enum), model, status,
provider requestId, elapsedMs, retryDelayMs and known token usage. Undefined
usage is unknown and may have been billed; do not count it as zero. Provider
requestId can be used for Azure/provider-side trace investigation. Transport
failures may have no requestId because no response headers arrived.

Log no raw error message, request/response body, URL, key or card text. Public
failure metadata remains code+fingerprint and is not a provider trace ID.
A ready event means transport/contract validation succeeded; it does not prove
semantic correctness. Bad translation reports feed a separate review process.

Per-attempt provider timeout defaults15s. Existing browser translation timeout
is12s: a foreground caller may stop waiting while server attempts continue.
Verify the end-to-end timeout/background work contract before release changes
that rely on retries; server retries cannot make the browser wait automatically.
No production deployment is implied by the research PR.

Full100 first-attempt experiment evidence is immutable/no-retry. The explicit
one-case recovery script records new per-attempt runs linked by original hashes,
with a maximum3 additional calls after the original failure. Never overwrite
original failed responses or improve first-attempt statistics using recovery.
