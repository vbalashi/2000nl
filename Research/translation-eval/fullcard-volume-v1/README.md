# v8/high — 100 full production-bounded meanings, volume audit

Owner: #655. Authorized 2026-10-11. No prompt/model/settings changes; no cache,
DB, learning-state, audio or production mutations. Separate translation research.

## Protocol and results

- Frozen ownerless system dictionary snapshot, SHA256
  `5a87440b86c72e10ef9e07c41320eb692768773ec4fc501ac5546c3c44f8d234`;
  5000 rows, nl-vandale/vandale single-meaning entries only. Not live traffic.
- 100 unique headwords, all NL → RU; 25 per source-content size band. First three
  bands deterministic hash selection; final band takes the 25 longest unique
  headwords in this pool. No synthetic padding or omitted contextual examples
  beyond actual application limits.
- Actual `buildDictionaryMeaningTranslationRequest`, message builder and
  `OpenAITranslator` used. Requests equal frozen application bodies on every
  attempt. Luna6 v8/high, max_completion_tokens2200, JSON mode, timeout15s,
  transient retries at most3 after initial. Fallback disabled to isolate v8.
- 127 sent examples, 80 sent idioms. Largest source had27 fields; production
  builder sent24, omitting3 examples. No source text field was truncated.
- 111 calls: 100 received HTTP200 responses and11 aborted timeout attempts.
  Served model on100 responses: `gpt-6-luna-2026-09-22`.

| Sent content characters | Cards | Ready | First-attempt ready | Without findings | Minor | Meaning errors | Failed |
|---|---:|---:|---:|---:|---:|---:|---:|
| 7–67 |25|25|25|25|0|0|0|
| 73–118 |25|25|25|24|1|0|0|
| 121–187 |25|25|25|25|0|0|0|
| 344–1022 |25|11|10|11|0|0|14|

The one minor finding is awkward wording in an example. All86 completed outputs
were reviewed field by field by the primary agent, nonblind, not human-approved;
263 content fields plus headword primary/alternatives/base/note. These are
observations, not a proven population quality rate. The14 failed outputs are
not silently excluded from overall readiness/acceptance counts.

13 final failures returned `finish_reason=length`, completion2200, reasoning2200,
empty visible content. One final failure returned complete JSON but omitted one
required idiom explanation. Transient retries occurred on11 timeout attempts;
length/contract errors were not retried as if transient.

Known usage from100 received responses: prompt165820, completion98323,
reasoning87460 (included in completion), cached110631 (included in prompt).
11 timeout attempts have unavailable usage; these totals are not a complete
billing total. No verified Azure money estimate is claimed.

## Interpretation

Strong observed association between long/complex cards and failure to receive a
complete answer. All13 length failures explicitly exhausted the shared
reasoning+visible-output cap, so this exposes a settings limitation; it does not
by itself demonstrate poor translation language quality or a bad prompt.
Among completed outputs, no deterioration in field fidelity was observed.
Selection enriches idioms and complexity in the long group; group execution was
ordered from small to long, so time/load also confounds timeout comparisons.
No causal text-length effect or traffic-wide56% failure rate is claimed.

Keep current prompt. Proposed next experiment, not executed/approved as rollout:
raise completion allowance and timeout on the same full-card corpus, compare
readiness and known cost; optionally separately test medium reasoning. Do not
split cards or alter the prompt without evidence that settings alone are
insufficient. Production settings remain unchanged.

## Recovery and artifacts

Exact licensed sources, bodies, response text/usage, safe diagnostics, reviews,
HTML and complete runtime source snapshots stay local, outside Git:
`/Users/khrustal/adhoc/2000nl-research-archives/655-fullcard-volume-v1/`.
The final report is `index.html`; machine summary `summary.json`; frozen input
manifest `manifest.json`; all findings `assessments.json`; failure detail
`failure-analysis.json`. Configured endpoint URLs, API keys and credentials were never archived.

Scripts: `apps/ui/scripts/translation-fullcard-volume/{run.ts,report.py,verify.ts}`.
Run from apps/ui using local vite-node, first `prepare`, then `execute`.
This v1 directory is immutable for execution: existing manifests/results refuse
implicit resume or overwrite. Offline `report.py` verifies bodies/hashes/reviews.
The executed run.ts snapshot differs from final checked-in run.ts only by removal
of an unsupported ESLint rule name in its leading comment; runtime unchanged.
Two earlier zero-call preparations are retained in sibling `*-preflight-unrun`
directories. Draft summary before usage clarification is retained separately
inside final artifacts and is not the final report.
