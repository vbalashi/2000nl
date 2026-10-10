# Full100: common single-pass translation, 2026-10-10

100 distinct real curated NL meanings, 70 RU /30 EN. All translation-eligible
fields of each selected meaning went through the production bounded request
builder. Native short entries were retained: median113 source characters,
maximum284, not artificially padded. This is an enriched stratified dictionary
sample, not an unbiased sample of production traffic or entire multi-sense articles.
Audio and complaint-driven semantic revision are excluded.

## Frozen experiment and selection

[Protocol](FULL100-PROTOCOL-v1.md), [corpus hashes](evidence/full100-v1/corpus-receipt.json),
[choice frozen before validation](evidence/full100-v1/prompt-choice.json).

30 development cases ×common v3/v4 ×3 models =180 calls. The predefined primary
criterion selected **one common v4**: pooled sense/content errors fell8/90→4/90;
all needs-work16→15. GPT acceptance nevertheless fell21→19/30, Luna5.6 27→26,
Luna6 26→30. No model-specific prompt or adaptation after validation.

70 disjoint held-out cases ×3 models =210 first-attempt calls. One HTTP500
stopped Luna5.6 after15 ready responses; a separately frozen continuation ran
only54 unattempted cases. The failed case was not repeated inside this cohort.
Total original protocol:390 calls,389 ready,1 HTTP500. All exact inputs,
responses, manifests, hashes, assessments and reviews are preserved locally.

User subsequently requested diagnostics and up to3 retries. A separate recovery
of the one failed case succeeded on its first additional request, with identical
bodyFingerprint and prompt. **391 total calls,390 ready responses** including
recovery. Original first-attempt metrics are unchanged; recovery cost is separate.
The original HTTP500 had no recorded request ID/body diagnostic, so its root cause
is unknown; it cannot be reconstructed from the generic status.

## Held-out assessment

All209 ready original validation responses were inspected against NL fields by
the primary agent, non-blind. This is preliminary, subjective agent assessment,
not independent human approval. Every decision binds exact manifest/response
hashes and five rubric scores. Acceptance requires every dimension≥4 and no
failure code; a weak optional equivalent can therefore make an otherwise good
translation need work. Empty alternatives alone are not failures. Automatic
allowed-stem checks deliberately have no lexical gold and do not establish quality.

| Model, same v4 | Accepted | Needs work | Transport failed | Sense/content errors |
|---|---:|---:|---:|---:|
| GPT-4.1 |46/70 (65.7%)|24|0|7|
| Luna5.6 |46/70 attempts (65.7%);46/69 ready (66.7%)|23|1 HTTP500|7|
| Luna6 |59/70 (84.3%)|11|0|6|

Observed important issues: GPT reverses who can harm whom in full086; GPT and
Luna5.6 render the non-spatial particle daar as там; Luna6 turns the chair's
armrests into several backrests. Optional equivalents sometimes narrow or broaden
the sense, repeat grammar, or use an incorrect form. Luna6 also has awkward idiom
phrasing, loss of urgency, and lost emphasis. The corpus exposes a source error in
full090; source correctness and translation fidelity must be assessed separately.
Exact cases/rationales are in the versioned safe reviews; full licensed sources
and outputs remain in local evidence/review pages.

**No model meets the frozen≥95% fully acceptable guardrail.** Luna6 is the best
candidate in this preliminary cohort, but this does not justify automatic model
promotion. Even a Wilson interval for its observed59/70 is approximately74–91%;
agent judgement, stratification and one draw add uncertainty beyond that interval.
Production model and prompts were not changed. Next owner step: blind review,
especially disagreements/serious errors, then choose whether to accept the
candidate or revise a new prompt against new held-out data.

## Measured cost, translation only

[Machine-readable summary](evidence/full100-v1/summary.json). Token totals below
cover **one selected-v4 translation of all100 meanings per model**, development30
plus validation70. This combined100 is appropriate for cost, not independent
held-out quality. For Luna5.6, the successful recovery supplies the100th answer;
usage/billing of the original failed request is unknown and excluded.

| Model | Input tokens/100 | Output tokens/100 | Reference USD/100 | Mean USD/meaning | Latency p50/p95 |
|---|---:|---:|---:|---:|---:|
| GPT-4.1 |86,227|12,858|$0.275318|$0.002753|2.88/3.76s|
| Luna5.6 |86,127|17,081|$0.037723 +unknown failed usage|$0.000377|1.18/3.66s|
| Luna6 |86,127|29,423|$0.023324|$0.000233|2.35/4.02s|

Public uncached short-context Standard reference prices per1M input/output tokens,
verified2026-10-10: GPT4.1 $2/$8 ([OpenAI](https://developers.openai.com/api/docs/models/gpt-4.1));
Luna5.6 $0.20/$1.20 ([Microsoft](https://azure.microsoft.com/en-us/blog/gpt-5-6-now-available-in-microsoft-foundry/));
Luna6 $0.10/$0.50 ([OpenAI Standard pricing](https://developers.openai.com/api/docs/pricing)).
These are **not confirmed deployment-specific Azure invoice rates**. No audio,
semantic review, taxes, discounts or cached-input savings included; output totals
include billed reasoning. Missing usage is unknown, not zero.

All391 experimental calls have known reference cost **$0.444276 +unknown usage
of one HTTP500**. This includes v3/v4 development comparisons and the one recovery;
it is distinct from the cost of100 ordinary production translations.

## Retry/logging implementation

Accepted [user amendment](../../docs/discussions/2026-10-10-05-translation-retries-and-diagnostics.md):
up to3 retries after the initial call (maximum4 attempts), exponential300/600/1200ms
backoff, bounded Retry-After for429/5xx, timeout/network recovery. Permanent4xx,
malformed/empty/incomplete responses and contract errors are diagnosed without
blind regeneration. The shared OpenAI translator now uses this policy in the PR;
no deployment was performed. This replaces its old2 retries for every error.

Safe structured server logs carry correlation/attempt IDs, stage, closed reason,
HTTP status, allowlisted provider request ID, elapsed time, retry decision/delay
and known usage. Raw card text, provider error messages, URLs and keys are absent.
Public failure shape remains code+fingerprint. A request ID supports provider-side
investigation; the prompt cannot diagnose network/server internals.

Research baseline runner remains explicitly no-retry to preserve original
first-attempt evidence. Recovery orchestrator uses the shared retry policy,
new immutable run per attempt and a total3 recovery-call cap, linking the original
failed manifest/response. Tests cover successful recovery, exhaustion, permanent
HTTP statuses, timeout/network, Retry-After, invalid JSON and secret redaction.
Existing browser client has a12s timeout versus15s per provider attempt; retries
can outlast a foreground request. This pre-existing mismatch remains an explicit
release limitation; background/server recovery logs are preserved, but this PR
has not established a new end-to-end foreground timeout contract.

## Owner review and preservation

Local anonymous page: `runs/review-full100-v1/index.html` —100 cases, three shuffled
responses each, blank human scores, explicit original failed response. Recovery
page: `runs/review-full100-recovery-v1/index.html`. Use export JSON to preserve
ratings; the separate blind key resolves model/run/hash afterward. Scores are
stored locally in the reviewing browser until exported.

Exact sources/outputs include licensed dictionary material and stay outside Git,
in ignored runs and the external evidence archive. Safe summaries/reviews/scripts
are tracked. Do not retire the active #657 worktree before owner review or verified
archive restoration. PR#658 remains draft; no release/main sync/retirement yet.

Validation:38 focused tests passed (provider, retry integration, frozen evaluation,
alternative persistence); UI typecheck and focused lint passed. Corpus audit
confirmed disjoint30/70 and100 unique headwords with70RU/30EN. Python scripts
parse; summary replay verifies exact response/manifest hashes. Anonymous page
browser smoke:100 choices,3 cards per case, explicit HTTP500 card, first/last
navigation, no page errors. [Archive receipt](evidence/full100-v1/archive-receipt-v3.json)
records the external archive digest and3086 preserved files.
