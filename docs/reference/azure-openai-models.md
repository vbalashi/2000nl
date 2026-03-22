# Azure OpenAI Models Reference

Reference for available models on Azure AI Foundry (Microsoft Foundry) for potential use in 2000nl.

Source: https://learn.microsoft.com/en-us/azure/ai-foundry/foundry-models/concepts/models-sold-directly-by-azure

## Azure OpenAI Models

| Family | Models | Notes |
|---|---|---|
| GPT-5.2 | `gpt-5.2`, `gpt-5.2-chat`, `gpt-5.2-codex` | NEW, Preview. 400k context. Registration required |
| GPT-5.1 | `gpt-5.1`, `gpt-5.1-chat`, `gpt-5.1-codex`, `gpt-5.1-codex-mini`, `gpt-5.1-codex-max` | 400k context. Registration required for gpt-5.1/codex/codex-max |
| GPT-5 | `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `gpt-5-chat`, `gpt-5-pro`, `gpt-5-codex` | Frontier reasoning. Registration required |
| GPT-4.1 | `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano` | Cost-effective general-purpose agent workloads |
| GPT-4o / 4 | `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo` | Multimodal (text + images) |
| O-series | `o4-mini`, `codex-mini` | Reasoning models |
| Embeddings | `text-embedding-3-large`, `text-embedding-3-small`, `text-embedding-ada-002` | Text to vector |
| Image gen | DALL-E series | Image generation from text |
| Video gen | `sora-2` | NEW |
| Audio/TTS | Whisper, TTS models, GPT-4o audio | Speech-to-text, text-to-speech |

## Third-Party Models (sold directly by Azure)

| Provider | Models |
|---|---|
| DeepSeek | `DeepSeek-V3.2`, `DeepSeek-V3.2-Speciale`, `DeepSeek-V3.1`, `DeepSeek-V3-0324`, `DeepSeek-R1-0528`, `DeepSeek-R1` |
| Meta | `Llama-4-Maverick-17B-128E-Instruct-FP8`, `Llama-3.3-70B-Instruct` |
| xAI | `grok-4`, `grok-4-fast-reasoning`, `grok-4-fast-non-reasoning`, `grok-3`, `grok-3-mini`, `grok-code-fast-1` |
| Mistral | `Mistral-Large-3`, `mistral-document-ai-2505` |
| Moonshot AI | `Kimi-K2.5`, `Kimi-K2-Thinking` |
| Cohere | `Cohere-command-a`, `embed-v-4-0`, `Cohere-rerank-v4.0-pro`, `Cohere-rerank-v4.0-fast` |
| Microsoft | `MAI-DS-R1`, `model-router` |
| Black Forest Labs | `FLUX.2-pro`, `FLUX.1-Kontext-pro`, `FLUX-1.1-pro` |

## Key Notes

- GPT-5.1 `reasoning_effort` defaults to `none` — must explicitly set if you want reasoning
- GPT-5.1-chat does not support `temperature` parameter (reasoning model)
- Preview models not recommended for production
- Hub-based projects limited to: gpt-4o, gpt-4o-mini, gpt-4, gpt-35-turbo
