# Clean-room lexicography prompt evaluation

This offline harness compares prompts for independently authored Dutch
learner-dictionary articles. It is an evaluation tool, not a production
dictionary publisher.

## Editorial target

- Standard Dutch used in the Netherlands.
- Definitions should normally be understandable around A2-B1 without a
  translation. A harder word is acceptable only when it is necessary and the
  surrounding explanation makes it clear.
- The generator receives the lemma, part of speech, and deterministic grammar
  facts. It never receives provider definitions, examples, idioms, sense count,
  raw HTML, media links, or provider identifiers.
- The current frozen pilot direction is core-first: independently usable
  senses, concise definitions, and two natural examples. Optional fields are
  deterministically empty in this pass because prompt-only enrichment proved
  materially less reliable. A separate audited enrichment stage is the next
  boundary, not an implicit part of the core prompt.

## Evaluation boundary

Prompt selection separates two questions:

1. **Independent article quality**: natural Dutch, clear learner definitions,
   useful examples, sound grammar, and conservative factual claims.
2. **Reference alignment**: whether independently generated senses happen to
   cover the selected source meanings and remain independently worded.

Reference alignment is diagnostic. It must not reward close stylistic
imitation, and a hidden rare source sense is not treated as a generator error
when the generator was never given an independently authored sense brief.

Each source-aware judge request may receive bounded text for exactly one
selected reference sense. All generation and judging calls are restricted to
the configured private Azure OpenAI deployment. Judge output uses closed codes
and scores; it cannot return source quotations.

## Benchmark and holdout

The benchmark is grouped by lemma, so senses from one source article never
cross splits. Development and validation cases are available to the optimizer.
Holdout inputs and references live in the local release vault and can be
released only once for a frozen finalist record. Generated runs, caches,
protected references, mappings, and review responses stay below the ignored
`reports/generated/` tree.

The committed benchmark catalog contains no provider text. The blind review is
a local, network-free HTML file. It randomizes A/B position, interleaves
swapped repeats, stores progress in the browser, and exports JSON or CSV with
bundle hashes. The origin mapping is a separate private file.

## Promotion policy

Candidates pass deterministic schema and copying checks before paid judges run.
They are then evaluated by a source-blind learner-quality judge, a conservative
optional-claims auditor, and a bounded source-aware fidelity judge. Before
promotion, `judge-pairwise` presents the two generated articles under
deterministically randomized A/B labels and repeats a subset with swapped
labels to measure position bias. It is unavailable for holdout and rejects any
candidate not bound to the exact generation manifest and immutable request
cache. The blind owner bundle applies the same provenance check. `compare`
consumes this aggregate blind result
and rejects a challenger on hard-gate regression, insufficient blind wins, or
strong side bias. Scalar deltas, reference-alignment diagnostics, and bootstrap
uncertainty are retained as aggregate-only
`lexicography-prompt-comparison-v2` artifacts; v2 intentionally omits case
identities and per-case score pairs. Finalists also receive an independent
agent review; GPT-4.1 is not treated as the final authority on its own output.

Stop after three consecutive non-promotions or eight challenger rounds. Freeze the finalist before the
single holdout release. A public or paid corpus build needs a separate
licensing/database-rights decision; clean-room generation and similarity scores
are engineering controls, not legal clearance.

## Azure model profiles

`generate`, `judge`, and `judge-pairwise` accept `--model-profile` without changing the
application's active `OPENAI_MODEL`. Supported pilot profiles are `gpt-4.1`,
`gpt-5.6-luna`, `gpt-5.6-terra`, and `gpt-5.6-sol`. GPT-5.x requests omit
`temperature`, use `max_completion_tokens`, and set `reasoning_effort: none`;
GPT-4.1 keeps its existing `temperature` and `max_tokens` payload.

An explicit profile first reads dedicated Azure metadata such as
`AZURE_OPENAI_GPT56_LUNA_DEPLOYMENT`, `..._ENDPOINT`, and
`..._API_KEY_PRIMARY`, then falls back to the shared private Azure endpoint and
key. Every provider call refuses public OpenAI or a non-Azure endpoint.

All commands accept `--dry-run`. Put it before the subcommand, for example
`lexicography_eval.py --dry-run generate ...`; it performs no reads, writes, or
provider calls and reports the selected command, model profile, and budget.
Any benchmark generation larger than five cases additionally requires
`--preflight-run-dir` for a completed five-case development run with the same
prompt, model, and endpoint; sealed holdout also supplies `--preflight-sample`.
`compare` requires `--phase` and derives one canonical ledger from the frozen
benchmark/selection identity. The ledger enforces the three-failure/eight-round
development plateau plus one two-finalist validation comparison and records its
winner. Sealed holdout commands must match the committed finalist decision's
benchmark, selection, prompt hash, model, canonical ledger hash, and validation
comparison hash. The already-opened 2026 pilot is an explicit compatibility
case: its immutable run binding is reusable only while both original local
validation manifests still match the hashes committed in the finalist decision;
that protocol cannot open another holdout. Provider retries are explicit new invocations, never
hidden calls outside `--max-requests`. The frozen pilot preparation enforces
its exact 64 lemmas, 80 senses, split counts, and per-POS lemma/sense quotas.

## Pilot result

The frozen human-review finalist is recorded in
`finalist-decision-v1.json`: prompt K with GPT-4.1. On 12 unseen validation
cases it beat prompt J in nine paired cases and independent reviewers found
10–11 clean articles. The sealed holdout produced 10–11 clean articles out of
12; `sprake` exposed a phrase-bound lexical-unit failure, and one reviewer also
flagged merged senses for `gelegenheid`.

This is intentionally a human-reviewed core pilot. Optional idioms,
collocations, synonyms, and usage patterns remain a separate audited enrichment
stage. The local blind form contains 64 original items plus eight swapped-side
repeats and was browser-tested for rendering, autosave, navigation, and JSON/CSV
export.
