# Optional equivalents and literal idioms — 2026-10-10

Issue #655. Synthetic Dutch → Russian/English evaluation, isolated from article generation.
558 successful provider responses, each with frozen requests, prompt messages/settings, raw answer, token usage, timing, response/input hashes and attempt diagnostics. No customer corpus or credentials.

## Result and selection

Candidate: Luna 6, prompt v8, reasoning **high**, one request, max_completion_tokens 2200. No enrichment request is needed for this stage. Useful equivalents are optional; omission is correct. Literal translations are optional, must preserve the source image and add understanding beyond the natural translation.

| Frozen fresh set (24 translations) | low | medium | high |
|---|---:|---:|---:|
| v8 | 20/24 | 21/24 | 24/24 |
| v9 | 22/24 | 21/24 | 21/24 |

v8/high: development 47/48, regression 24/24, fresh 24/24: **95/96 accepted**. One serious literal-image error remains: cat-ru changes the source out-of-tree image to a cat sitting on a tree. No critical errors observed. On matched development + fresh inputs: candidate 71/72 versus v5 baseline 68/72. The extra regression set has no matching baseline.

These are non-blind agent assessments, not human approval or statistical evidence about production. Development/regression inputs informed prompt tuning; fresh inputs were written after v9 froze, but were used to select the prompt/effort combination. An independent population validation is still absent. More reasoning did not consistently improve v9.

## Cost and latency

On the same 24 fresh inputs, v8 low used 37,084 input + 4,801 completion tokens (2,886 reasoning), median 1,737 ms. High used 37,084 + 11,201 (9,214 reasoning), median 2,778 ms. Reasoning is included in completion usage: high increased output tokens 2.33× and median latency 1.60×. Dollar costs require the actual Azure deployment tariff; no price is inferred from a model name. These short synthetic inputs do not estimate a full production card population.

All 558 calls completed on the first attempt in this experiment. This does not prove provider reliability. The runner uses the shared transient-failure classifier and up to three retries; saves every attempt without provider secrets. Research timeout is 60 seconds; production's existing 15-second limit is unchanged.

## Long-input defect and fix

The original builder spent the source budget on standalone examples, lost the idiom explanation and sent an example fragment “T”. Original stress-v8-high answers remain marked as source assembly failures. Idioms/explanations now precede owned and standalone examples; optional fields that do not fit are omitted whole. stress-final captured the intermediate correction; stress-complete captures the final correction including usage-note omission. Final two full responses completed in 7.7–8.3 seconds within the existing output cap; no claim about tail latency follows from two calls.

## Review and reproduce

Open index.html for source/result pairs, filter by run; assessment.json binds each reviewed answer to its response and manifest hashes. summary.json contains counts and token/timing totals. Each run manifest retains actual prompt messages, including earlier prompt/profile settings.

From apps/ui after the runtime/profile change is available:

```sh
DICTIONARY_TRANSLATION_PROFILE=luna6-v8 npx vite-node scripts/translation-literal-eval/run.ts -- --run new-v8-high --fresh --reasoning high --live
```

Omit --live for a saved dry run with zero provider calls. Use a fresh run ID; existing runs reject changed inputs/settings. Use --held-out for the regression set, neither flag for development, and --stress for bounded full-card inputs. Credentials are read privately from existing local configuration and never saved.

The report script contains the explicit reviewed findings. New runs require explicit assessment registration; they are not automatically accepted. Reproducing an old run exactly should use its saved messages/settings, rather than assume the current input builder is unchanged.
