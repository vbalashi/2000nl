# MWE comparison protocol

2026-10-18; external research #742. Owner explicitly authorized experiments
and external methods research. No user collection/article/runtime mutations.

References are reconstructed from the three already captured public YouTube
sources; raw source slices stay ignored. Source rights/provenance unchanged:
NOS author captions, Easy Dutch and LUBACH own AudioFilms ASR. These sources
were previously inspected, so this is not a blind held-out benchmark.

The 32-case extraction reference was frozen before comparative extraction
requests: SHA256 `e2a366cc7ac42bbddc287f71a6688f09a5f65bfc1ba1d3e794b5d05391497b13`.
It contains 23 required lexical cores and seven optional/borderline units;
16 familiar challenge cases and 16 extra cases including ordinary composition
and ASR uncertainty. Operator reference, not independent native-speaker gold.
Ordinary standalone words belong to the existing word pipeline; only marked
slang single tokens may enter this extraction. Register is a separate field.
This set does not establish slang detector accuracy or corpus-wide recall.

Parser-neutral token IDs/character offsets allow discontinuous cores. Fixed
articles/particles are included; variable arguments and pronouns omitted.
Reference and outputs remain separate. Dictionary heading is not source quote.

Comparisons, same cases and schema:

1. Existing two-rule dependency proposal baseline with spaCy sm/md and Stanza
   Alpino. These are candidate rules, not trained MWE taggers or lexicon-backed
   detectors. This is not a fair comparison of all capabilities of the parsers
   versus an LLM; it tests our current deterministic proposal strategy.
2. Luna low generic versus explicit category taxonomy.
3. Same taxonomy with Luna high; same taxonomy with Sol low.
4. Luna low taxonomy with neighbour sentences; with spaCy sm parser hints.
5. Two separate Luna low specialists (grammar constructions / lexical units),
   union by case/token core; additional cost and false positives recorded.
6. Same Luna taxonomy low repeated once; a repeatability observation, no
   statistical stability claim from two runs.
7. Union across six general conditions and two specialists, then a separate
   Sol low request checks units without extractor explanations or model labels.
   Exact cores retained, veto does not silently repair/re-anchor outputs.

A separate 12-case dictionary-lemma/POS reference was frozen before lemma-model
requests: SHA256 `9f711fa04fe760c03051582aa6d84a6be36735d252e73cd2eba5be0cbda2b21f`.
It intentionally selects known hard parser cases. Historical full-source spaCy
sm, fresh isolated-sentence sm/md/Stanza, Luna low/high and Sol low are compared.
Adjectival/adverbial citation lemmas are dictionary-oriented, not universal
UD gold; predefined acceptable POS alternatives are retained. No general Dutch
lemmatizer accuracy claim follows from this sample.

Metrics: one-to-one exact-core precision/recall/F1; separate relaxed token-set
IoU>=0.5 diagnostic (not PARSEME's official partial metric). Optional exact
matches are neutral, not extra true positives. Canonical exact-string recall
is only a naming-consistency diagnostic; synonymous headings may be acceptable.
Missing/invalid cases remain visible; unit tests cover discontinuous alignment,
one-to-one matching, optional neutrality and reference exclusion from payloads.
Scorer implementation corrected/tested before result interpretation; this is
not a preregistered formal study.

Deployment allowlist verified live: gpt-6-luna 2026-09-22 and gpt-6.1-sol
2026-09-29, GlobalStandard, Sweden Central, resource dilumio-01-resource.
Fresh phase caps: 64 HTTP calls aggregate, 1.5 MiB input requests, 96 KiB/request,
8192 output tokens/call, 30 minutes from first request. No transport retries,
trace export or server-side response storage. No instruction to expose private
reasoning; only concise evidence notes. SDK roles are bounded no-tool calls
where all inputs are already available; tool calling is unnecessary here.

Methods documentation: [primary-source research](MWE-METHODS-RESEARCH-20261018.md).
OpenAI [reasoning guide](https://developers.openai.com/api/docs/guides/reasoning)
recommends treating reasoning effort as one tuning knob, not the sole quality
repair mechanism. [Stanza batching](https://stanfordnlp.github.io/stanza/getting_started.html)
and [spaCy Dutch](https://spacy.io/models/nl) establish implemented parser options.

Additional staged regression, before its own model calls: twelve prior sense
cases frozen with SHA256
`0fdd653a16a7a8ecffaa4a9facc4033284907221f52e03148f9b2a47095dd9bf`.
Eleven certain and one uncertain label; Luna low/high and Sol veto/contrast.
This prompt deliberately addresses prior known failures, not a held-out test.

After observing union/veto redundancy, a development follow-up grouped overlapping
units and asked Sol to reconcile/repair one unit per group. This follow-up and
its clarified boundary instructions are post-hoc; it sees the union of eight
conditions, so it does not isolate prompt improvement from richer proposals.
One partial review response was preserved and missing work separately completed
with <=8-item exact-cardinality batches. Both interventions are reported, not
presented as a clean preregistered experiment. All fit the original64-call cap.
