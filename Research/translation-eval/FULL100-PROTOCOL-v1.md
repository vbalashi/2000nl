# Single-pass full100 protocol v1 — frozen before calls

Authorized by user 2026-10-10: 100 full meanings, translation only; audio and
post-report revision excluded. Owner issue #657 / PR #658. No production changes.

Sources: deterministic md5 read-only pool of 5000 ownerless curated public/system
NL dictionary entries, selecting nl-vandale only. Licensed full source and exact
responses stay local/archived; Git receives scripts, prompts, aggregate hashes
and safe assessment metadata. No user dictionaries, progress or learner data.

100 unique headwords; all prior research words excluded. Disjoint selection:
20 definition+idiom, 20 multiple examples, 15 usage-pattern, 25 ordinary example,
10 idiom-only, 10 definition-only. Deterministic hash order, 30 development /
70 validation selected before calls; 70 RU / 30 EN, 30% EN within each split.
This is an enriched stratified source sample, not an unbiased traffic average.
"Full" means all translation-eligible content through the production bounded
request builder, not an entire multi-sense headword article or arbitrary target
word count. Native short entries remain short, not artificially padded.

Common v3 vs one common v4 on 30 development cases × three models: 180 calls.
No personalized prompts. Score every exact output by rubric v1 (non-blind agent,
not human/independent judge). Main errors: sense/content fidelity below4; other
needs-work and same-sense alternative usefulness next. Select ONE common prompt
by fewer main-error responses pooled across models, then fewer all needs-work,
then mean equivalentUsefulness; tie-break shorter prompt. Freeze choice and
hash before held-out. No adapting after validation outputs.

Selected common prompt ×70 held-out cases ×3 models: 210 calls, one response
per case/model, no semantic judge call per production request. Total cap390,
max_output2200, maxCalls30/70 per run, deadline600 seconds per run, same model
settings as previous experiments, no auto-retries. Any failure remains evidence;
never silently drop/retry cases or swap sources.

Report all field fidelity, serious errors, naturalness, alternatives, base,
transport/contract failures, p50/p95 usage and latency, translation-only cost
estimates with explicit public-reference rates (not actual Azure invoices).
No lexical gold for these new source texts: empty allowed-stem sets deliberately
flag review; automatic nonempty-alternative counts are not proof of usefulness.

Promotion guardrail for recommendation: no observed reversed negation/obligation
or other critical meaning corruption; at least95% fully acceptable responses
on held-out, with honest uncertainty (70/model not proof of true95% quality).
If no candidate passes, report no winner rather than lowering the threshold.
Cost may choose among quality-qualified models, not excuse critical errors.

User will inspect results afterward. Save anonymous review pages and exact
source/output versions. Preserve rejected candidates and full evidence outside
worktree before retirement. Report/feedback pipeline replay is separate and
not billed as part of this translation experiment.
