# Related-word translation comparison — 2026-10-10

Owner: #655. Separate translation research; not article generation. Synthetic source data only.

## Decision

Keep the existing production Luna 6 v8/high prompt and one request. The missing feature was absent source fields, overlay storage and public/UI projection. Both profiles correctly translated all 60 related fields in 32 RU/EN cards. v10 did not improve whole-card quality: v8 52/56 accepted versus v10 51/56 in this exploratory review. Each had one serious literal-image error on a cat idiom; these are unrelated to relation translation. Do not interpret these small nonblind samples as statistical superiority or human approval.

## Saved evidence

112 requests: 32 related-word cases and 24 reused synthetic regression cases per profile. All 112 ready on first attempt. The regression set was used in earlier prompt work: it is **not** a fresh held-out set. No audio or second model review requests. `manifest.json` freezes full source, messages and request settings; each result includes raw output, parsed contract, usage, attempts, timing, hashes. `assessments.json` binds explicit agent assessments to input/response hashes. `summary.json` aggregates the observations; `index.html` is an offline source/result/assessment viewer.

Assessments: agent, nonblind, no human approval. Findings distinguish relation-field correctness from whole-card quality. Known cat literal errors remain visible. Request latency uses research timeout 60s; production timeout is unchanged. Reasoning tokens are included in output tokens, not an extra billable total. No tariff estimate is made without the actual endpoint billing rate.

Rebuild: `python3 apps/ui/scripts/translation-related-eval/report.py` from the companion source checkout. The runner requires the companion runtime changes exposing the v10 and exact v8/high profiles. Run IDs are immutable; preserve attempts rather than overwrite failures. Provider diagnostics use the existing retry taxonomy and up to three retries after the initial attempt.

## Runtime acceptance

Existing related terms only; meaning-sensitive word translation, preserving degree/register/direction. Exact relation/source/target/policy identity. Sparse omitted fields never shift translations to another word. Ready matching translations appear beside the original under the shared translation toggle in Library and Training. No source mutation, migration or mass regeneration; old affected cache entries are refreshed through the existing stale-source workflow. Default v8/high policy remains unchanged for entries without relations.
