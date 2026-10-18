# Azure and OpenAI agent runtime options — 2026-10-18

Status: research / proposed pilot choice. Documentation review only: no model requests, resource creation, package installation, account-access verification, or configuration changes.

## Recommendation

Compare two runners against the **same existing Azure model deployment, cases, instructions, output schema and four read tools**: (A) an explicit Responses function-calling loop; (B) the OpenAI Agents SDK local Runner using an explicitly configured Azure client. Start with the already captured YouTube cases; reserve a different video for generalization. These are two orchestration implementations, not two different models. This recommendation is an engineering inference from the documented interfaces below.

Do not add a Foundry-managed agent resource just to run four application functions. Keep the adapter boundary small so that a later hosted worker can reuse the tools. Tool callbacks, user scope, checkpoints, total budget, idempotency and collection writes remain application responsibilities; a model API's background execution does not make our tool execution durable.

## What is actually different

| Option | Who runs the loop / tools? | Fit for this increment |
| --- | --- | --- |
| Azure OpenAI Responses v1 | Our process calls the model, dispatches function calls, and returns their results | Most transparent baseline; Azure documents `/openai/v1/responses`. Verify deployed model and supported parameters before use. |
| OpenAI Agents SDK + Azure client | Local SDK Runner manages model turns and registered callbacks | Direct comparison with less handwritten orchestration; explicitly select the Responses model adapter and deployment. |
| Foundry project Responses / Agent Framework | Application can keep agent definition in code while using project-scoped inference/tools | Additional Azure-native option if project capabilities are needed; unnecessary new dependency for local dictionary tools. |
| Foundry Agent Service prompt / hosted agents | Microsoft-managed definitions or hosting; custom code can be deployed | Later operational choice when managed identity, hosting and project governance justify setup. |
| OpenAI managed Agents API | OpenAI runs a managed Codex harness | Separate service from Agents SDK and Azure Responses. Azure availability **not established** by this review. |

Azure documents the v1 Responses endpoint and API-key or Entra authentication. Availability depends on region and model; documentation does not establish that our resource has a suitable deployment or quota. [Azure Responses guide](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/responses?tabs=rest), [REST reference](https://learn.microsoft.com/en-us/rest/api/aifoundry/azureopenai/responses).

The OpenAI SDK documents separate Responses and Chat Completions adapters and custom OpenAI-compatible clients. This supports an Azure integration path, subject to actual endpoint/model compatibility. Pin package versions and explicitly select the deployed model rather than accepting SDK defaults. [SDK models](https://openai.github.io/openai-agents-python/models/).

SDK tracing is enabled by default and has a separate export configuration. For the Azure-only pilot disable the default OpenAI trace exporter and keep local traces; setting the Azure inference endpoint alone does not redirect OpenAI tracing. [SDK configuration](https://openai.github.io/openai-agents-python/config/).

Microsoft now documents a project-scoped Responses entrypoint, `{project_endpoint}/openai/v1/responses`, for ephemeral agents, distinguished from the Azure OpenAI resource endpoint. Project-specific tools and governance are the reason to consider this path; generic custom tool calling alone is not. [Foundry Responses quickstart](https://learn.microsoft.com/en-us/azure/foundry/agents/quickstarts/responses-api).

Agent Framework is an application framework; Foundry Agent Service is a managed platform. Hosted agents can package our custom code, while prompt agents store their definitions in the service. Hosting requires project resources and permissions; it is not automatically granted by possession of an Azure OpenAI key. [Agent Service overview](https://learn.microsoft.com/en-us/azure/ai-foundry/agents/overview), [hosting prerequisites](https://learn.microsoft.com/en-us/azure/foundry/how-to/develop/framework-hosted-agents).

OpenAI's current runtime comparison explicitly distinguishes its managed Agents API from the local Agents SDK and direct Responses API. The managed API offers a Codex harness; this does not imply that Azure's similarly named services expose that API. No affirmative official Microsoft documentation confirming this deployment path was found. Treat it as unverified, rather than asserting either availability or impossibility. [OpenAI runtime comparison](https://developers.openai.com/api/docs/guides/agents), [managed Agents API overview](https://developers.openai.com/api/docs/guides/agents-api/overview).

## Pilot compatibility and evidence checklist

1. Inspect existing approved Azure routing without printing secrets. Record only sanitized endpoint class, deployment/model, authentication method, SDK versions and service API surface.
2. Exercise one bounded function-calling case before the full set: tool arguments → local callback → tool output → schema-valid final answer. Keep reasoning/function items required by the protocol when continuing a turn.
3. Use `context_read`, `morphology_suggest`, `dictionary_search`, `entry_read` only. Source text and tool results are evidence, never instructions. Enforce resource IDs, user scope, result-size limits and allowed arguments in code.
4. Run the same frozen cases through direct Responses and SDK. Record complete usage per actual model response, function names/arguments/results, wall time, retries, terminal state, output validation and semantic evaluation. SDK execution alone is not a quality improvement claim.
5. Bound both model turns and function invocations, including parallel calls. Rate-limit failures and retries consume time/budget; save checkpoints. If token price or response usage is unavailable, report cost as unknown rather than zero.
6. Keep collection mutation outside this comparison. Compare to reviewed pilot decisions; those decisions are evaluation labels requiring review, not independently proven truth. Use an unseen video before claiming autonomous generalization.

Neither hosted multi-agent orchestration nor dynamically discovering tools is needed with four known read functions. Routing between ingestion, selection and generation can remain ordinary code. Introducing additional model routers would add calls that must demonstrate measured benefit.
