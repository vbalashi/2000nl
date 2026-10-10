# Literal-image accuracy — 2026-10-10, #655

## Result

Keep production Luna 6 v8/high unchanged. Two immutable appended system refinements were compared at the same high reasoning/2200 output limit and unchanged user prompt. The structural variant removed both known cat image errors in development; the conservative variant retained the Russian cat error. Structural was selected before any held-out calls, but did not confirm a safe improvement on new idioms: one new wrong rain/drop image and one rejected empty explanation. No production profile/cache/DB/UI change or mass regeneration.

| Run | Ready | Accepted whole cards | Serious image errors | Delivery failure |
| --- | --- | --- | --- | --- |
| Development v8 |40/40|36/40|2|0|
| Development structural |40/40|37/40|0|0|
| Development conservative |40/40|38/40|1|0|
| Held-out v8 |24/24|21/24|0|0|
| Held-out structural |23/24|19/24|1|1|

168 calls, 167 ready, all one attempt. Existing retry taxonomy retained: transient HTTP429/5xx/network/timeouts up to3 retries after initial; contract-invalid is permanent. wire-en returned HTTP200, complete JSON and an empty idiom explanation; its raw response, request ID, contract reason and safe failure fingerprint are retained. No silent repeat or discarded failure. No audio or second model review calls. Reasoning tokens are included in output tokens. Actual endpoint dollar tariff is not asserted.

## Method and limitations

20 development cases ×RU/EN across3 prompts, then12 new cases ×RU/EN across baseline and selected candidate. Prompts, criteria and inputs frozen before calls; selection committed before held-out calls. Two preliminary held-out idioms were discovered in prior research and replaced **before any held-out calls**; zero-call superseded manifests remain in preflight-unrun. Final idiom expressions checked against prior literal source suites. Conservative held-out manifest is frozen but intentionally unrun; dry-baseline is also zero-call.

Nonblind agent review, no human approval, no statistical superiority claim. Exact source/result/assessment hashes retained. Minor judgments are subjective. Current rubric permits semantic natural paraphrases of social formulas; it does not require a single phrase grammatical form. Known synthetic fixture limitation: stone headword is independent of its flies idiom; no source edits after outputs. Helpful-image opportunities depend on whether the actual natural target wording already carries the source image. Selection's19 retained development images means19 emitted; structural has one awkward grammar finding, leaving18 fully acceptable. Both availability and quality are separate report fields.

Rain/drop diagnosis checked against https://onzetaal.nl/schatkamer/lezen/uitdrukkingen/van-de-regen-in-de-drup-raken after observing the disputed output: drup denotes dripping water/drops, not entering one isolated drop. No invented roof/etymology required in model output. Primary reference/source notes: scripts/translation-literal-accuracy/SOURCES.md.

## Review and reproduction

index.html: offline searchable viewer with full source/result/findings and failure attempts. summary.json: counts, tokens and median/p95 latency. Per-run manifest freezes messages/settings; assessments.json binds findings to exact responses. selection.json preserves pre-held-out reasoning.

From the source checkout, `python3 apps/ui/scripts/translation-literal-accuracy/verify.py` verifies input parity/settings/field identity/hashes; `python3 apps/ui/scripts/translation-literal-accuracy/report.py` rebuilds the viewer. Typecheck, focused ESLint and guidance drift passed. No runtime/UI change, so no new browser or DB validation required. Broader UI checks for preceding release #665 both completed successfully (38083464427 /38083588774).

Next experiment, not implemented: shorter image-only guidance that explicitly retains every required nonempty field, with fresh confirmation examples and the new rain/empty-field failures added to regression. Current evidence does not justify selecting the structural prompt for production.
