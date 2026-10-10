# Dictionary translation model rollout and rollback

`DICTIONARY_TRANSLATION_PROFILE` selects the complete dictionary translation profile:

| Value | Model | Prompt | Cache |
| --- | --- | --- | --- |
| `luna6` (default) | gpt-6-luna, high reasoning | Luna v8 | Model/settings/prompt identity |
| `luna6-v5` | gpt-6-luna, low reasoning | Previous Luna v5 | Exact previous identity |
| `luna6-v6`, `luna6-v7`, `luna6-v8`, `luna6-v9` | gpt-6-luna, low reasoning | Evaluation candidates | Version-specific identity |
| `gpt41` | gpt-4.1, temperature 0 | Common v4 | Model/settings/prompt identity |
| `legacy` | Existing general provider configuration | Original v1 | Original identity |

Luna requires server-only `AZURE_OPENAI_GPT6_LUNA_ENDPOINT` and `AZURE_OPENAI_GPT6_LUNA_API_KEY_PRIMARY` (or `_API_KEY`). GPT rollback uses the retained `AZURE_OPENAI_ENDPOINT` and `AZURE_OPENAI_API_KEY_PRIMARY` (or `_API_KEY`). New profiles use Azure OpenAI v1 with their fixed model name. Missing credentials or unknown profiles fail closed. Keep old GPT credentials available. No migration or bulk cache deletion is needed. A cached result is reused only when its source/profile fingerprint matches. Storage retains one row per entry, language and provider: translating with a new profile replaces that row on demand. Rollback may therefore require a fresh translation; it restores the previous configuration, not a historical cache snapshot. Generic fragment translation retains its general configuration.

The NUC server reads `/srv/2000nl-ui/.env`. Change the profile there and recreate the UI service through the established deployment procedure; a simple container restart does not reload env_file values. For rollback select `gpt41`; choose `legacy` to recover the exact former production prompt and cache identity. Verify health, deployed revision and a synthetic dictionary translation after recreating the container. Preserve the private environment backup and never attach credentials or source text to an issue.

Provider diagnostics include stage, reason, model, HTTP status, request ID, duration, token usage and retry outcome, excluding raw source, translated text, headers and credentials. Temporary 429/5xx, timeout and network failures receive at most three retries after the initial attempt. Permanent HTTP errors, malformed JSON and incomplete contracts fail directly. First-attempt failure and recovered success remain distinct in logs.

Known limit: provider retries may outlast the existing client timeout and pending-claim lease. This release does not redesign those deadlines; inspect request IDs before manually repeating an apparently stalled translation. Retries address transport failures, not semantic mistakes.

New literal-enabled profiles explicitly request JSON-object response mode, matching the evaluated provider payload; v5 rollback settings stay unchanged.

Luna v8 adds optional `literalText` on idiom content translations in the same request. Missing/null literal remains valid for prior profiles and non-useful images. The stored JSON overlay carries `meanings[i].idioms[j].literalText`; no SQL migration is required. Public node translations expose it only alongside the ready, fresh natural idiom translation. Training and Library use the shared article renderer and common visibility switch. There is no second enrichment request or bulk refresh. Select `luna6-v5` for the immediate pre-literal prompt rollback.
