# Translation continuity and observation — #728

## Owner reproduction

Joint production observation on 2026-10-17 in the owner's existing Chrome Nikolai tab. Owner started saved Translation training, observed many translation requests, then left the card idle. Ready face and revealed answer were periodically replaced by a brief loading screen, returning to the same card. Six owner marks were recorded. The initial/current additional English translation also started only after reveal despite minutes spent on the face.

Sanitized local evidence is preserved outside the issue checkout at `/Users/khrustal/dev/2000nl/reports/qa/production-post-migration/joint-blink-2026-10-17/` (`capture-01.json`, `capture-02.json`, `capture-03.json`, `observations.md`). The last capture contains 726 events with no dropped events. No request bodies, auth headers or card text are stored in these capture files. Raw local diagnostics are not release artifacts.

Minute revalidation starts at monotonic 360269, 420269, 480270 and 540269 ms. Intermediate UI samples at 14:35:17.698Z, 14:36:17.197Z and 14:37:17.450Z show ready controls replaced by a SECTION; new control identities appear afterward. Last two sampled intervals are approximately 250ms, subject to the 250ms sampling interval. The third mark at 14:37:18.234Z follows the automatic cycle. These precede the agent export interaction at 14:37:55.331Z. The document and recorder survive: this is app presentation replacement, not full-document navigation. Marker clicks can themselves return focus from DevTools and trigger a separate revalidation, so timing around a mark alone is insufficient.

## Causes and changes

### Ready-card loading

`dictionaryTranslationEvents` revalidates on focus/visibility and every 60 seconds. `useWordContextPrompt` returns a fresh ready object. The card compared the result with `synchronizedContext` by object identity, then performed an authoritative Training lookup before restoring readiness. The new object forced a loader even when the exercise/source identity was unchanged. That unmounted answer-side components, which can abort their own outstanding lookups.

Readiness now follows owner, session/presentation, entry/direction, content/translation languages, content node and source fingerprint. Same-scope background refresh keeps the ready card mounted. Changed identities require synchronization; non-ready authoritative responses still use the existing unavailable/error path. Training lookups and ownership validation remain authoritative.

### Repeated translation HTTP requests

The initial capture has 14 completed `/api/platform/translation` requests, all HTTP 200. Most start roughly 1.3 seconds apart. `observeDictionaryMeaningTranslation` waited one second after each pending response, matching one second plus approximately 300ms HTTP latency. It observes durable work for up to five minutes; ordinary subsequent reads set `force:false` and `observeOnly:true`. Source invalidation can request a replacement via `needsEnqueue`. Speculative background preparation returns after one request.

Default observation delays now grow 1/2/4/5 seconds, capped at five. Explicit caller poll intervals remain fixed. The observation deadline, abort, one-shot background work and source-replacement semantics remain unchanged. This reduces status traffic during long generation; readiness detection can be up to five seconds behind server completion after backoff. The capture cannot prove that every request referred to one job, or count actual provider generations: individual payload/job identities were intentionally not retained.

### Current additional translation

The latched buffer prepares future members. The answer-side additional-language provider previously mounted only after reveal, so the first/current English projection could not be available before reveal. Backend enqueue alone would still leave a reveal-time lookup delay. The current provider must own preparation plus the display projection before reveal for Word in Context; answer markup remains conditional and the future additional buffer stays one entry ahead. Primary Off and equal-language suppression remain enforced.

An interrupted speculative enqueue must also be eligible for retry. Buffer effect cleanup releases only its own unfinished attempts; a late rejection cannot clear a newer effect's ownership. Successful pending enqueues remain deduplicated.

## Verification and limits

The initial focus/minute component regressions failed against the old object-identity gate: `training-v2-loading` replaced the ready card. Updated regressions cover both face and already revealed answer, retain the same control node during delayed authoritative lookup, preserve the answer side and check changed readiness scopes. Observation regressions failed before adaptive polling, then pass with bounded intervals, cancellation and deadline handling. Additional-language regressions check preparation before reveal and reuse on reveal.

Focused local fixtures exercise the actual hooks and component, with mocked transports. This does not establish production deployment or provider latency. Production owner confirmation remains after review and normal release.

Final local checkpoint: 174 tests passed across ten focused files (card session, action boundary, stage, additional provider, word context, observation, revalidation events, future buffer, recovery, and translation request service). Typecheck passed. Lint passed with the pre-existing `handlePlayAudio` effect-dependency warning. Independent read-only review found no actionable blockers. Current secondary projection belongs to the retained provider; the future-only buffer does not duplicate its enqueue. No browser production verification of patched code or deployment has occurred.
