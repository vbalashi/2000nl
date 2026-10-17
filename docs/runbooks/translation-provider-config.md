# Translation provider configuration

Keep provider routing, model deployments, endpoints, and credentials in the
server environment. Do not put provider credentials in `NEXT_PUBLIC_*` values.

| Purpose | Provider/model selector | Endpoint | Credential |
| --- | --- | --- | --- |
| Dictionary meanings (default profile `luna6`) | `DICTIONARY_TRANSLATION_PROFILE=luna6`; `AZURE_OPENAI_GPT6_LUNA_MODEL` | `AZURE_OPENAI_GPT6_LUNA_ENDPOINT` | `AZURE_OPENAI_GPT6_LUNA_API_KEY_PRIMARY` (or `_API_KEY`) |
| Dictionary rollback (`gpt41`) | `DICTIONARY_TRANSLATION_PROFILE=gpt41`; `AZURE_OPENAI_GPT41_MODEL` | `AZURE_OPENAI_GPT41_ENDPOINT`, falling back to `AZURE_OPENAI_ENDPOINT` | `AZURE_OPENAI_GPT41_API_KEY_PRIMARY` / `_API_KEY`, falling back to `AZURE_OPENAI_API_KEY_PRIMARY` / `_API_KEY` |
| Generic text/fragment translations | `OPENAI_MODEL=gpt-6-luna` (legacy aliases: `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_MODEL`) | `OPENAI_API_URL`, otherwise `AZURE_OPENAI_ENDPOINT` | `AZURE_OPENAI_API_KEY`, otherwise `OPENAI_API_KEY` |
| Provider routing | `TRANSLATION_PROVIDER`, optional `TRANSLATION_FALLBACK` | Provider-specific URL variables such as `DEEPL_API_URL` | Provider-specific server secrets |
| Optional Gemini provider | `GEMINI_MODEL` | `GEMINI_API_URL` | `GEMINI_API_KEY` |
| Optional DeepL provider/fallback | No model selector | `DEEPL_API_URL` (provider default when omitted) | `DEEPL_API_KEY` |

The dictionary profile selects the prompt, request settings, timeout, and cache
identity. Its model, endpoint, and key come from the matching environment
variables. If the selected dictionary model, endpoint, or key is missing, the
translator is unavailable; it does not silently use the generic model or
fallback provider. Model names must match the Azure deployment names.

For Luna, set `AZURE_OPENAI_GPT6_LUNA_MODEL=gpt-6-luna`, endpoint, and key
together on local, test-production, and production environments. The endpoint
may include `/openai/v1`; the application appends `/chat/completions` once.
Generic translation now uses the same `gpt-6-luna` deployment through
`OPENAI_MODEL` and `AZURE_OPENAI_ENDPOINT` (or `OPENAI_API_URL`). Keep the
generic model value aligned with `AZURE_OPENAI_GPT6_LUNA_MODEL` when changing
the Azure deployment name.

The NUC host at `/srv/2000nl-ui/.env` is the test-production deployment. The
public `https://2000.dilum.io` endpoint currently routes to that same host; it
is not a second application environment. A separate production host would need
its own environment inspection before its configuration can be reported.

See [dictionary translation rollout and rollback](dictionary-translation-model-rollout.md)
for profile versions, cache identity, release procedure, and recovery.
