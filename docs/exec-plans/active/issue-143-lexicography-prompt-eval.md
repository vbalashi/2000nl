# Clean-room lexicography prompt evaluation pipeline

Status: implemented; human blind review pending
Issue: `vbalashi/2000nl#143`
Branch: `codex/lexicography-prompt-eval`
Base: `246685ff460ac79c221bd3627c39f22287396259`
Started: 2026-08-11

## Goal

Build a reproducible offline harness that develops and evaluates prompts for
original, learner-friendly Dutch dictionary meanings generated with GPT-4.1.
Van Dale is a protected local benchmark, not a generation input or publication
source.

The first pilot is personal research. Full-corpus generation and any public or
commercial release remain outside this issue and require a separate review of
the subscription terms, copyright, database rights, endpoint policy, and the
planned output license.

## Owner decisions

- The first pilot is for the owner's personal Dutch study.
- The generator follows a clean-room boundary and never receives Van Dale
  definitions, examples, idioms, ordering, raw HTML, media, or provider IDs.
- A source-aware evaluator may send one selected sense's bounded text fields to
  the owner's Azure-hosted GPT-4.1 deployment. It never sends raw HTML or the
  corpus in bulk.
- Generated Dutch targets a non-native learner around A2-B1 and should prefer a
  controlled defining vocabulary. Harder words are allowed only when needed
  and should be explained through simpler wording or examples.
- Source-containing run artifacts and the final blind bundle are local-only,
  ignored, and never committed or published.

## Owning layer and boundaries

This work belongs to `packages/ingestion` as offline dictionary tooling. It
does not modify the UI runtime, production Platform API, database schema,
source corpus, translations, learning state, or external-client contracts.

Committed inputs contain only prompt text, rubrics, schemas, tests, and an
open development/validation benchmark manifest with structural strata. They
do not contain protected definitions, examples, idioms, raw HTML, media URLs,
generated source-comparison bundles, or holdout identities. Holdout selection,
inputs, references, release ledger, and run binding live in the ignored vault.

## Claimed scope

- `packages/ingestion/src/lexicography_eval/`
- `packages/ingestion/scripts/lexicography_eval.py`
- `packages/ingestion/tests/unit/test_lexicography_eval_*.py`
- `packages/ingestion/lexicography_eval/`
- this execution plan

Claimed semantic resources:

- `sample-case-v1`
- `prompt-v1`
- `candidate-v1`
- `judgment-v1`
- `run-manifest-v1`
- the frozen 64-lemma / 80-sense pilot benchmark
- the local blind-review artifact contract

## Public seams under test

1. `prepare`: a local structured corpus plus a frozen selection specification
   produces a deterministic, headword-clustered sample manifest and protected
   local reference bundle.
2. `generate`: a prompt version and safe sample manifest produce validated
   candidates without protected source text in the model request.
3. `judge`, `judge-pairwise`, and `compare`: candidates pass deterministic hard
   gates and bounded source-aware/source-blind evaluation. The pairwise judge
   receives randomized opaque A/B articles, repeats a subset with swapped
   sides, and exposes aggregate verdicts only. Promotion consumes that blind
   result plus aggregate scalar gates; independent agent and owner reviews are
   blinded separately.
4. `render-blind`: a frozen finalist and protected references produce a
   local-only randomized A/B review page with autosave and JSON/CSV export.

## Benchmark

Freeze 64 headword clusters covering 80 Dictionary Meanings:

- 24 noun lemmas / 30 meanings;
- 18 verb lemmas / 25 meanings;
- 10 adjective lemmas / 12 meanings;
- 5 adverb lemmas / 6 meanings;
- 3 function-word lemmas / 3 meanings;
- 4 minor-POS lemmas / 4 meanings.

Cross-cutting coverage includes core and extended vocabulary, polysemy
contrasts, idiom-bearing and idiom-only meanings, separable and irregular
verbs, morphology and valency, abstract/technical vocabulary, register, and
examples present or absent in the source.

Split by the complete normalized headword/provider-article cluster, never by a
sense file: 40 development lemmas, 12 validation lemmas, and 12 locked holdout
lemmas. The holdout is unavailable to prompt optimization and opens once after
the finalist prompt is frozen.

## Generated content contract

Preserve deterministic identity and available structured morphology. The
prompt-only tournament demonstrated a quality/coverage tradeoff: asking one
ungrounded pass to add all senses and enrichment repeatedly produced false
synonyms, free combinations labelled as collocations, and phrase-bound pseudo
senses. The frozen pilot direction is therefore core-first:

- one concise Dutch learner definition;
- exactly two original examples for every admitted sense;
- the smallest defensible inventory of independently usable senses;
- no optional fields in the core pass.

Collocations, usage guidance, synonyms, and idioms remain in the schema but
will be handled by a separate enrichment stage after the core pilot. This
issue does not silently treat prompt-only optional enrichment as production
ready.

Every candidate records prompt/model/run metadata and similarity flags.

## Evaluation and safety gates

Hard gates precede preference scoring:

- valid schema and non-empty definition where the candidate is learnable;
- target-sense and part-of-speech fidelity;
- natural and grammatical Dutch;
- no invented idiom, valency, morphology, register, or regional claim;
- no exact source example reuse;
- no suspicious continuous source span or near-copy.

Separate signals:

1. deterministic exact, token n-gram, longest-common-span, and example-reuse
   checks against the source corpus;
2. source-blind GPT-4.1 learner-quality judge;
3. source-aware GPT-4.1 fidelity/originality judge returning only scores and a
   closed error-code vocabulary;
4. blinded finalist review by an independent model family and the owner.

The optimizer sees aggregate scores and closed error codes only. It never sees
source quotations or item-specific rewrites from the source-aware judge.

## Prompt tournament and stopping rule

- Start with three meaningfully different baseline prompts.
- Change one documented prompt hypothesis per challenger.
- Run a five-case preflight before any benchmark batch.
- Cache by sanitized request hash and make reruns resumable.
- Enforce explicit request and output-token budgets; cached serial execution is
  the current conservative default. Deadline/cost caps and concurrency remain
  later hardening, not a claim of this pilot.
- Every public command supports `--dry-run`; a dry run reports intended writes,
  provider use, model profile, and request budget without reading inputs,
  calling a provider, or writing artifacts.
- Promote only when hard-gate performance does not regress and paired quality
  improves by at least 0.10 on a five-point scale with at least a 60% win rate.
- Stop after three consecutive challengers fail promotion or after eight
  challenger rounds.
- Compare at most two finalists on validation, freeze one prompt, then open the
  holdout exactly once.

## Blind owner review

The local static page randomizes A/B by seed and does not reveal source names
in labels, DOM metadata, or filenames. Each item records:

- A better, B better, both good/tie, or both bad;
- definition clarity, Dutch naturalness, and example usefulness;
- flags for wrong meaning, awkward Dutch, excessive difficulty,
  grammar/morphology, dubious idiom, or suspicious copying;
- confidence and optional comment.

Eight swapped-side repeats measure position bias and consistency. Results are
exportable as JSON and CSV. The page makes no network requests.

## Validation sequence

1. Red/green tests for each public seam.
2. Focused ingestion unit tests after every slice.
3. Five-case no-source-leak preflight through GPT-4.1.
4. Development prompt tournament and validation finalists.
5. Independent design/code review before holdout.
6. One locked-holdout run and independent `gpt-5.6-terra` review.
7. Render and inspect the local blind page.
8. Run the full ingestion test suite and repository-relevant checks.
9. Commit, push, and hand off review-ready work linked to issue #143.

## Recorded outcome

- Compared GPT-4.1, GPT-5.6 Luna, and GPT-5.6 Terra with the same prompt and
  clean-room development inputs. Luna and Terra often improved prose or added
  coverage, but independent reviews found more lexical-unit and sense-admission
  failures. GPT-4.1 remains the pilot generator.
- Iterated through prompts A-L. The last broad-coverage challenger regressed by
  admitting false or construction-bound senses. On the locked validation set,
  prompt K beat J in 9 of 12 pairs and received 10–11 clean judgments.
- Froze prompt K and opened the sealed holdout once under run ID
  `k-gpt41-final-v1`. Independent source-blind holdout reviews found 10–11 clean
  articles out of 12. `sprake` is the shared blocker; `gelegenheid` is a second
  reviewer-specific concern.
- Generated the 64-item / 80-reference blind bundle with eight swapped repeats.
  Browser QA caught and fixed a CSV-export JavaScript escaping defect, then
  verified rendering, navigation, local persistence, JSON export, CSV export,
  and a clean browser console.
- This result authorizes only a human-reviewed personal pilot. It does not
  authorize unattended full-corpus generation or public/paid publication.

## Progress

- [x] Read workspace, repository, architecture, and lifecycle policies.
- [x] Inspect corpus structure, current GPT-4.1 configuration, and existing
  translation eval harness.
- [x] Complete independent architecture, lexicography, and adversarial
  copyright/evaluation reviews.
- [x] Record owner decisions and create isolated worktree/branch.
- [x] Create issue #143 and lifecycle claim.
- [ ] Add issue #143 to GitHub Project 2; current token lacks `read:project`.
- [x] Implement benchmark preparation and physically separated holdout vault.
- [x] Implement clean-room generation and prompt contracts.
- [x] Implement deterministic, quality, optional-claim, and bounded fidelity evaluation.
- [x] Implement prompt comparison and plateau reporting.
- [x] Implement local blind review with interleaved swapped repeats.
- [x] Run the pilot and complete independent reviews.
- [ ] Finish review-ready handoff.
