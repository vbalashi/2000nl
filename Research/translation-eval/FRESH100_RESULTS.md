# Luna 6 v5 versus GPT-4.1 v4: fresh100

Frozen acceptance rule before validation: more accepted outputs; no increase in serious sense/content errors (score ≤2); no increase in critical role/negation/modality reversals. **Passed.** The owner authorized promotion conditional on this rule. Production implementation is isolated in issue #659.

| Metric | GPT-4.1 common v4 | Luna 6 tuned v5 |
| --- | ---: | ---: |
| Accepted / 100 | 55 | 93 |
| Serious sense/content | 6 | 2 |
| Critical reversal | 1 | 1 |
| Ready on first attempt | 100 | 100 |
| Input tokens | 86,865 | 100,865 |
| Output tokens (includes reasoning) | 12,934 | 30,895 |
| Reasoning output tokens | 0 | 20,076 |
| Reference USD / 100 | 0.277202 | 0.025534 |
| Median / p95 milliseconds | 2903.5 / 4358 | 2451.5 / 4065 |

Luna reference cost is about 10.86 times lower. Prices use public uncached Standard short-context reference rates verified 2026-10-10, GPT $2/$8 per million input/output tokens and Luna $0.10/$0.50. Actual Azure invoice tariff is unverified. Translation only: audio and review excluded. Source: https://developers.openai.com/api/docs/pricing . No cached tokens were reported.

## Design and reproducibility

20 already-seen development cases were used to assess v5 (16 accepted, 4 need work, no serious errors). Then the prompt and relative gate were committed at b94cab97 before fresh validation. There were 220 total new model requests, no failures/retries. Fresh100 contains 100 unique new headwords excluded from all previous experiments, 70 Russian / 30 English, across six source strata. It is an enriched benchmark, not a random population estimate.

The comparison changes both model and prompt: GPT uses the stronger common v4, rather than old production v1; Luna uses v5. Scores are non-blind primary-agent manual assessments of all 200 outputs against their source. They are not human-reviewed labels. Optional alternatives occurred in 88 GPT outputs and 44 Luna outputs; count alone is not usefulness. Agent assessment favoured avoiding redundant or misleading alternatives while retaining useful ones.

Exact bound review files, immutable run/response sidecars and summary are under evidence/fresh100-v1 and runs/fresh100-{gpt41-v4,luna6-v5}. Regenerate the summary with scripts/summarize-fresh100.py. Corpus receipt and pre-validation freeze are checked in. Raw corpus, responses and anonymous owner-review UI remain local/archived, not in the release PR.

## Remaining failures

Luna's seven needs-work cases are fresh014 (missing shortness), 017 (broad responsibility alternative), 026 (Russian gender agreement), 028 (Sinterklaas replaced by Santa Claus: serious), 053 (liking direction reversed: serious/critical), 055 (adds equal halves), 070 (circular wet/liquid definition). GPT also reversed liking direction on fresh053, and had five other serious errors. A passed relative gate does not mean errors have disappeared.

Owner review interface: runs/review-fresh100-v2/index.html. Its model labels are anonymous and scores initially blank. The agent's completed labels are kept separately; owner assessments can be exported and bound to the same immutable outputs without another provider call.
