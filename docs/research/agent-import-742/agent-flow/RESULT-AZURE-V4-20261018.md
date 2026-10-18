# Azure agent loop: bounded repair and published cost estimate

2026-10-18; discovery #742/#745; continuation explicitly authorized by owner after
v1–v3. External pilot only, no app integration or production collection changes.
Prior17 requests retained; this phase allowed at most12 additional requests and used10.

## What changed

New optional `HardenedToolBox` projects canonical UUIDs as short server references
(R0001 etc.), restores IDs before validation/evaluation, and retains accepted items
when another item fails. Unknown targets/evidence still fail the original scope gate.
Before `not_found` on a nonempty mismatching initial shortlist, code requires an
additional dictionary search with a query different from the initial query. This
proves an extra retrieval attempt, **not** exhaustive search or semantic correctness.
The finite authorized snapshot remains explicit; an uncached query is not global
proof of dictionary absence.

A rejected result supplies candidate-specific repair feedback to the model, with
accepted candidates retained. Direct loop: at most4 model responses per task;
SDK: at most2 runs of3 turns,6 responses total; tool budget12 per task; phase HTTP
cap12, request/byte/time/output limits unchanged. Partial accepted items are also
saved with an error receipt on task failure. These are local receipts, not a durable
server job/resume implementation. No retries, response storage or SDK trace export.

The prompt now uses short entry references. Same frozen12cases, same model, same
prompt for direct and SDK; baseline omitted to avoid redundant spending. No labels
are passed to the model. Original v1–v3 artifacts remain unchanged.

## Observed results

| Condition | Reference agreement | HTTP calls | Tool calls | Task wall time sum | Input / output tokens | Published estimate USD |
| --- | --- | --- | --- | --- | --- | --- |
| Direct Responses v4 | 11/12 | 6 | 7 | 10.81s | 52,113 / 932 | $0.00304104 |
| Agents SDK v4 | 12/12 | 4 | 6 | 10.29s | 33,336 / 968 | $0.00282841 |

All4tasks passed mechanical validation. No live repair feedback was triggered:
partial acceptance/repair is verified by local negative fixtures, not a claimed
observed live recovery.16focused tests pass, including canonical ID restoration,
forged target rejection, item retention, required retrieval and cost accounting.

Direct incorrectly accepted the building-entry sense of `inbreken` in a computer
intrusion context (c206). Valid references cannot establish meaning suitability.
SDK rejected that target in this run. This is a single development pass on the
same video used to design the prompt, not independent gold, a production accuracy
estimate, a causal alias improvement result, or evidence SDK is intrinsically better.

All13 model-chosen tool executions were `dictionary_search` again. Other3handlers
were previously locally smoke-tested, not chosen here. No fifth tool needed yet.
Next quality work: independent video/list, checks distinguishing literal/figurative
sense gaps, retrieval coverage and a representative full-video run with cost receipt.
A separate semantic verifier/escalation is a proposal, not implemented or priced here.

## Price basis and accounting

Published Microsoft table for GPT-6 Luna Global Standard short context, USD per1M:
ordinary input0.10, cache read0.01, cache write0.125, output0.50.
[Microsoft pricing announcement](https://azure.microsoft.com/en-us/blog/gpt-6-astra-sol-and-luna-for-production-agents-in-microsoft-foundry/).
Current linked pricing page could not be retrieved; these are the dated announcement's
published rates, not a verified negotiated account price.

Azure documents `cached_tokens` and `cache_write_tokens` for newer model families:
[prompt caching](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/prompt-caching).
Assumption: these are disjoint subsets of input. Formula:

`USD = ((input - reads - writes)*0.10 + reads*0.01 + writes*0.125 + output*0.50)/1e6`

Reasoning is already included in output. Highest observed single-request input11,877
tokens. All27responses have usage, no unanswered requests. Prior17requests estimate
$0.01895655; new10requests $0.00586945; cumulative **$0.024826**. These are experiments
across several conditions, **not a full-video processing price**. Effective Azure
Sponsorship consumption/discounts/invoice not reconciled. No EUR conversion assumed.
Receipts and calculation: [cost JSON](cost-azure-20261018.json),
[v4 result](result-azure-v4-20261018.json), `summarize_cost.py`.

## Conditional per-video forecast

Using observed SDK v4 cost/12candidate decisions as a linear planning approximation:

| Candidates sent to resolver | Model-only forecast USD |
| --- | --- |
| 17 | $0.0040 |
| 100 | $0.0236 |
| All298 pilot candidates | $0.0702 |
| 1,000 | $0.2357 |

These are scenarios, not measured complete passes.17is not a claim all video decisions
have been independently proven by deterministic code. Unique words, contexts, retrieval
turns, cache hits and verification requirements vary; duration alone is insufficient.
A2x planning reserve would put the all298 scenario near$0.14, not a guaranteed cap.
The intended architecture sends only ambiguous cases after deterministic lookup;
passing all298 would be a different, more expensive strategy.

Excluded: subtitle retrieval/hosting/database infrastructure, audio transcription,
generated dictionary articles, stronger verifier model, managed sandbox/tool charges,
and operator/Codex development time. This video already has author subtitles, so no
speech-to-text call was used. Our local function handlers have no separate OpenAI
hosted-tool charge; their own compute/database costs still exist.

## OpenAI and Foundry options

The running pilot already uses OpenAI Agents SDK as a local orchestrator with an
Azure Responses client. Responses requires our code to execute tools/continue;
SDK handles that loop. Neither makes our worker job durable automatically.

OpenAI additionally documents managed **Agents API**, providing the Codex harness,
sessions, compaction and recovery; app supplies tools/environment. Model usage,
hosted tools and hosted sandboxes have their respective charges:
[official Agents API](https://developers.openai.com/api/docs/guides/agents-api/overview).
Its availability via our Azure subscription is not established; do not conflate it
with the already tested SDK-over-Azure arrangement.

Microsoft Foundry documents agents through a project Responses endpoint:
[Foundry quickstart](https://learn.microsoft.com/en-us/azure/foundry/agents/quickstarts/responses-api).
Our current resource `/openai/v1/responses` is not a deployed managed Foundry agent.
For this narrow read-only resolver, SDK plus an owned durable job/receipt layer is
the current prototype choice; managed alternatives remain candidates to evaluate,
not resources created in this phase.
