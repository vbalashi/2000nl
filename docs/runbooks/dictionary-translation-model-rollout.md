# Dictionary translation model rollout and rollback

`DICTIONARY_TRANSLATION_PROFILE` selects the complete dictionary translation profile:

| Value | Model | Prompt | Cache |
| --- | --- | --- | --- |
| `luna6` (default) | gpt-6-luna, low reasoning | Luna v5 | Model/settings/prompt identity |
| `gpt41` | gpt-4.1, temperature 0 | Common v4 | Model/settings/prompt identity |
| `legacy` | Existing general provider configuration | Original v1 | Original identity |

Luna requires server-only `AZURE_OPENAI_GPT6_LUNA_ENDPOINT` and `AZURE_OPENAI_GPT6_LUNA_API_KEY_PRIMARY` (or `_API_KEY`). GPT rollback uses the retained `AZURE_OPENAI_ENDPOINT` and `AZURE_OPENAI_API_KEY_PRIMARY` (or `_API_KEY`). New profiles use Azure OpenAI v1 with their fixed model name. Missing credentials or unknown profiles fail closed. Keep old GPT credentials available. No migration or cache deletion is needed; selecting a profile selects its matching cached results. Generic fragment translation retains its general configuration.

The NUC server reads `/srv/2000nl-ui/.env`. Change the profile there and recreate the UI service through the established deployment procedure; a simple container restart does not reload env_file values. For rollback select `gpt41`; choose `legacy` to recover the exact former production prompt and cache identity. Verify health, deployed revision and a synthetic dictionary translation after recreating the container. Preserve the private environment backup and never attach credentials or source text to an issue.

Provider diagnostics include stage, reason, model, HTTP status, request ID, duration, token usage and retry outcome, excluding raw source, translated text, headers and credentials. Temporary 429/5xx, timeout and network failures receive at most three retries after the initial attempt. Permanent HTTP errors, malformed JSON and incomplete contracts fail directly. First-attempt failure and recovered success remain distinct in logs.

Known limit: provider retries may outlast the existing client timeout and pending-claim lease. This release does not redesign those deadlines; inspect request IDs before manually repeating an apparently stalled translation. Retries address transport failures, not semantic mistakes.
