# Dictionary translation model rollout and rollback

`DICTIONARY_TRANSLATION_PROFILE` selects the complete dictionary translation profile:

| Value | Model | Prompt | Cache |
| --- | --- | --- | --- |
| `luna6` (default), `luna6-v11` | gpt-6-luna, high reasoning | Luna v11, example-supported equivalents | Model/settings/prompt identity |
| `luna6-v8-high` | gpt-6-luna, high reasoning | Exact previous Luna v8 | Exact previous identity |
| `luna6-v5` | gpt-6-luna, low reasoning | Previous Luna v5 | Exact previous identity |
| `luna6-v6`, `luna6-v7`, `luna6-v8`, `luna6-v9` | gpt-6-luna, low reasoning | Evaluation candidates | Version-specific identity |
| `gpt41` | gpt-4.1, temperature 0 | Common v4 | Model/settings/prompt identity |
| `legacy` | Existing general provider configuration | Original v1 | Original identity |

Luna requires server-only `AZURE_OPENAI_GPT6_LUNA_ENDPOINT` and `AZURE_OPENAI_GPT6_LUNA_API_KEY_PRIMARY` (or `_API_KEY`). GPT rollback uses the retained `AZURE_OPENAI_ENDPOINT` and `AZURE_OPENAI_API_KEY_PRIMARY` (or `_API_KEY`). New profiles use Azure OpenAI v1 with their fixed model name. Missing credentials or unknown profiles fail closed. Keep old GPT credentials available. No migration or bulk cache deletion is needed. A cached result is reused only when its source/profile fingerprint matches. Storage retains one row per entry, language and provider: translating with a new profile replaces that row on demand. Rollback may therefore require a fresh translation; it restores the previous configuration, not a historical cache snapshot. Generic fragment translation retains its general configuration.

The NUC server reads `/srv/2000nl-ui/.env`. Change the profile there and recreate the UI service through the established deployment procedure; a simple container restart does not reload env_file values. For rollback select `gpt41`; choose `legacy` to recover the exact former production prompt and cache identity. Verify health, deployed revision and a synthetic dictionary translation after recreating the container. Preserve the private environment backup and never attach credentials or source text to an issue.

Provider diagnostics include stage, reason, model, HTTP status, request ID, duration, token usage and retry outcome, excluding raw source, translated text, headers and credentials. Temporary 429/5xx, timeout and network failures receive at most three retries after the initial attempt. Permanent HTTP errors, malformed JSON and incomplete contracts fail directly. First-attempt failure and recovered success remain distinct in logs.

## Context-equivalents release (2026-10-13)

Prompt-only rollback is `DICTIONARY_TRANSLATION_PROFILE=luna6-v8-high`.
It restores the exact v8/high fingerprint
`129be0a92c4890f99ea96b8c5c48335d9e39fafa130597d0b96c2f92d0ef2035`
while retaining preparation fixes. Recreate **both UI and translation worker**
from the same immutable image and resolved configuration, then verify matching
health. Full application rollback uses the previous coordinated UI/worker image;
DB contract 223 is unchanged. A rollback restores policy, not a historical cache
snapshot: one artifact is retained per entry/language/provider slot.

V11 includes useful ordinary example-supported equivalents, while excluding
unrelated senses and headword meanings inferred only from idioms. Model, settings
and delivery budgets remain unchanged. Read-only lookup checks freshness and actual
requested-field completeness; visible-card preparation reaches the existing queue,
and completed translations invalidate reusable browser snapshots. No bulk backfill.
At that release, large-source partitioning remained deferred ADR-0018 scope;
bounded-request coverage did not claim whole-source coverage. The full-source
pipeline v4 below supersedes this limit.

Known limit: provider retries may outlast the existing client timeout and pending-claim lease. This release does not redesign those deadlines; inspect request IDs before manually repeating an apparently stalled translation. Retries address transport failures, not semantic mistakes.

New literal-enabled profiles explicitly request JSON-object response mode, matching the evaluated provider payload; v5 rollback settings stay unchanged.

Luna v8 adds optional `literalText` on idiom content translations in the same request. Missing/null literal remains valid for prior profiles and non-useful images. The stored JSON overlay carries `meanings[i].idioms[j].literalText`; no SQL migration is required. Public node translations expose it only alongside the ready, fresh natural idiom translation. Training and Library use the shared article renderer and common visibility switch. There is no second enrichment request or bulk refresh. Select `luna6-v5` for the immediate pre-literal prompt rollback.

## Related words (#655, 2026-10-10)

Existing synonyms/antonyms are translated in the same dictionary request and stored by canonical per-kind position in the existing JSON overlay. Canonical source normalization trims, removes blanks and deduplicates before request, revision and public relation identity. Sparse omitted positions remain sparse through JSON; never compact the translated arrays. Public projections expose only source/policy-matching overlays and the requested target language. Library and Training use the shared translation switch.

At the #665 release the default remained Luna 6 v8/high with the same prompt fingerprint; the current default is documented above. Relation-bearing source fingerprints change, making their old overlays stale under the existing refresh flow. Entries without related words retain their source/policy identity. No mass regeneration or schema migration. Explicit `luna6-v10` is experimental, not selected by default; `luna6-v8-high` preserves the exact previous prompt/settings for rollback. The synthetic comparison had all 60 relation fields correct per profile; whole-card assessment was 52/56 v8 and 51/56 v10, nonblind agent review without human approval. Known optional literal-image errors remain tracked separately.

## Full-source pipeline v4 / contract224 (#674)

Normal default: DICTIONARY_TRANSLATION_FULL_SOURCE_ENABLED is unset/true on both UI and worker. Full inventory, bounded parts, persisted recovery and aggregate coverage gate ready; successful part continuation is logged as translation_job_continued. Existing concurrency2, lease60s and failure retry3 remain. Small cards use one provider call. Large fields are segmented without source loss; successful parts survive retries/restarts and remain tied to the exact job/source/policy identity. No bulk regeneration.

Browser invalidations carry public identity only. Same-origin tabs receive BroadcastChannel/storage hints, refetch authoritative lookup and recover missed events at focus/visibility/every60s while visible. This is bounded eventual synchronization, not an offline or zero-latency guarantee. Existing caches may display while revalidation is in flight; server ready requires current source/policy and full inventory. Old application bundles must be refreshed to use the new client behavior.

Emergency backend rollback on the current224 image: set DICTIONARY_TRANSLATION_FULL_SOURCE_ENABLED=false in /srv/2000nl-ui/.env and recreate BOTH UI and translation-worker through the standard procedure. Confirm identical setting/images and healthy224. It restores exact v3 bounded-request identity and bypasses persisted parts; this restores previous behavior and disables full-source guarantees. Re-enable both services together to restore v4. Full code reversion must retain DB224 and additive objects; do not claim a prior223 image passes exact224 health. Preserve successful parts/source revisions; do not delete caches or reset jobs to roll back. Prompt-only rollback is independently luna6-v8-high as documented above.
