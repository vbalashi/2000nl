# Full-card budget experiment: same25 long meanings, unchanged v8/high

Owner #655; follow-up to fullcard-volume-v1; authorized2026-10-11. Same research
branch/PR670. Production settings remain unchanged; no DB/cache writes.

## Frozen experiment

The exact same25 real long-tail source requests and messages were rebuilt with
the current application builder and verified equal to prior snapshots. All14
previous failures and11 previous ready cases retained. Production translator
used with constructor timeout180000ms (was15000); an explicit experiment-only
transport override changes max_completion_tokens2200 to32768 before actual
send. Only these two parameters change; model/Luna6 v8/high/JSON/retries stay.

25 calls,25 HTTP200 responses, all finish_reason=stop; no retries, no timeouts,
no token-limit failures. Served model `gpt-6-luna-2026-09-22` throughout.
22/25 pass the strict application parser, versus11/25 previously. Three complete
JSON responses omit exactly one mandatory final idiom-explanation field: one
repeats the original omission; two were previously ready. All three failures
remain failures; no inferred translations, silent patching or semantic retries.
This remaining structural defect is independent of exhausted output budget.

All22 complete answers reviewed field by field, plus partial responses inspected
for missing fields. Primary-agent nonblind assessment, not human approval:
0 observed major semantic errors,3 minor findings (one broadened chamber-to-
parliament example, one potentially ambiguous Russian marriage term, one less
precise literal compartment/box image).19 fully accepted,22 structurally ready.
Do not equate structural readiness with perfect linguistic quality.

## Actual tokens and duration

| Metric per request | Mean | Median | P95 | Max |
|---|---:|---:|---:|---:|
| Input |1825.28|1786|2047|2195|
| Completion, includes reasoning |2456.52|2502|3989|6277|
| Reasoning, subset of completion |2082.08|2165|3443|5183|
| Visible output, completion minus reasoning |374.44|327|741|1094|
| Total input+completion |4281.8|4273|6036|8472|
| Duration seconds |16.243|15.393|32.139|38.378|

Known totals25/25: input45632, completion61413, reasoning52052 (already included),
visible9361, cached input45557, cache writes0. Maximum used19.16% of32768 cap.
In contrast, the original25-case study has11 aborted timeout attempts without
usage, so its known token/cost totals cannot establish actual billing increase.
One retry sample varies; not every long card consistently needs more than2200.

## Reference money estimate

Verified official source2026-10-11:
https://developers.openai.com/api/docs/models/gpt-6-luna
https://developers.openai.com/api/docs/pricing
Standard USD/1M input0.10, cached read0.01, cache-write0.125, output0.50.
Actual Azure invoice tariff unverified. Reasoning is charged in completion,
never added again. No audio or external review-model costs.

Uncached reference: (45632×0.10 +61413×0.50)/1M = **$0.0352697 /25 attempts**,
**$0.001410788 per attempted card**, **$0.1410788 per100 same-mix long cards**.
This includes the three incomplete-structure answers. The100-card figure is an
extrapolation, not100 new calls. Largest-card uncached reference$0.003358.
Cache-aware reference using reported read/write subsets: **$0.03116957 /25**,
$0.12467828/100. This repeat warmed/reused input cache; use uncached reference
for a less optimistic fresh-card estimate. Neither is an Azure invoice.

## Result and remaining work

The low cap/timeout caused avoidable failures; a generous completion allowance
costs only actual usage and does not force32768 tokens of output.32k/180s is a
successful experiment candidate for removing truncation in this corpus, not a
production rollout. No claim of100% readiness: three missing explanations
remain. Investigate preservation of every field separately, without shrinking
content or requiring etymology in literal translations. Prompt has not changed.

Budget and timeout changed together, model sampling is stochastic,25 cards are
an enriched tail and one draw per card. Original application24-field cap still
omits three source examples from the longest entry; this study does not fix it.

## Evidence and recovery

Exact licensed source/request/response bodies, safe retry diagnostics, frozen
runtime/prompt/runner sources, all reviews, failure details and offline HTML:
`/Users/khrustal/adhoc/2000nl-research-archives/655-fullcard-budget-v1/`.
See index.html, summary.json, manifest.json, reviews.json, failure-analysis.json,
pricing-reference.json. Scripts in apps/ui/scripts/translation-fullcard-volume:
budget.ts, budget_report.py, budget_verify.ts. Immutable execution artifacts;
no implicit overwrite/resume. Original100-card evidence remains intact.
