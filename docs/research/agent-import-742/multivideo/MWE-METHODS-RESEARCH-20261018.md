# Dutch expression extraction: research and experiment hypotheses

Date: 2026-10-18. Scope: external pilot for #742; research findings and proposed experiments, not an accepted production contract. Primary sources were read online. No model requests, database mutations, corpus downloads, or dependency installations were performed for this note.

## What the evidence supports

An agent receiving sentences is a useful candidate generator, but greater generative-model size or reasoning effort does not establish better extraction accuracy. The [2026 French comparison](https://aclanthology.org/2026.mwe-1.6/) found a specialized CamemBERT model outperforming gpt-oss and Qwen3. A [Romanian shared-task system](https://aclanthology.org/2026.mwe-1.31/) likewise favors encoder-based identification and generative paraphrasing. Conversely, [CoAM](https://aclanthology.org/2025.acl-long.1311/) found a fine-tuned LLM outperforming its MWEasWSD comparison. These concern different languages, training and benchmarks; none establishes the winner for Dutch conversational ASR or our Azure deployments.

The directly relevant Dutch approach combines syntax and lexical resources. [Towards a Dutch Parseme corpus](https://research-portal.uu.nl/ws/portalfiles/portal/231729841/21_towards_a_dutch_parseme_corpus.pdf) derives candidate annotations from UD and the Alpino lexicon, then calls for manual verification of component boundaries, semantic subclasses and omissions. Its conversion identifies particles through `compound:prt` and inherent reflexives through `expl:pv`; arbitrary verb–object attachment is insufficient evidence for a light-verb construction. Its 2024 implementation did not cover inherently adpositional verbs. This describes that implementation, not a universal limitation of today's Dutch tools.

[Current Dutch UD guidance](https://universaldependencies.org/nl/) uses `compound:prt` for separable prefixes and some wider phrasal constructions. This provides testable signals for discontinuous forms, not proof of idiomatic meaning. [UD Dutch-Alpino](https://universaldependencies.org/treebanks/nl_alpino/index.html) is predominantly written news, so performance on interviews, false starts and ASR punctuation must be measured separately.

## Define the task before counting success

[PARSEME 1.3](https://parsemefr.lis-lab.fr/parseme-st-guidelines/1.3/) focuses on verbal MWEs; [2.0](https://parsemefr.lis-lab.fr/parseme-st-guidelines/2.0/) extends the scope to nominal, adjectival/adverbial and functional expressions. The [1.3 collocation guidance](https://parsemefr.lis-lab.fr/parseme-st-guidelines/1.3/?page=010_Definitions_and_scope/050_VMWEs_versus_collocations) excludes combinations whose peculiarity is purely statistical. A learning collection can intentionally include useful transparent collocations, but these require a separate product label: a benchmark's non-MWE is not automatically useless learning material.

Use separate labels for idiom/fixed expression, separable verb, selected preposition construction, light-verb construction, collocation, discourse formula, slang/colloquial single word, and ordinary composition. Add independent `usefulness` and `certainty` fields. Slang is a register judgment and may involve a single token; forcing it into a multiword-only score obscures results. No Dutch slang-specific evaluated detector was established in this research.

[Lexicalized components and open slots](https://parsemefr.lis-lab.fr/parseme-st-guidelines/1.3/?page=010_Definitions_and_scope/040_Lexicalization_and_open_slots) must be distinguished: an expression may contain obligatory arguments that are freely replaceable. Our source annotation should retain actual words while the dictionary heading can normalize pronouns and arguments. Do not confuse the normalized heading with an exact source quote.

## Concrete resources and feasibility

| Resource | Relevant capability | Practical constraint |
| --- | --- | --- |
| [spaCy Dutch](https://spacy.io/models/nl) | Existing small pipeline versus medium/large alternatives; syntax, entities, lemmas | Written-news domain; changing size is an experiment, not guaranteed improvement. |
| [Stanza](https://stanfordnlp.github.io/stanza/getting_started.html) | Dutch pipeline with explicitly selectable packages, including `lassysmall`; CPU supported | Pin package, processors and model version; record cold loading separately from warm processing. Multiword-token expansion is not idiom identification. |
| [DuELME, INT](https://taalmaterialen.ivdnt.org/download/tstc-duelme/) | Over 5,000 Dutch MWEs grouped by syntactic equivalence classes | INT explicitly links separate commercial-use terms. No corpus was downloaded. |
| [DUCAME canonical forms](https://aclanthology.org/2024.lrec-main.8/) | Over 11,000 canonical MWEs with component annotations | Authors' [public resource link](https://surfdrive.surf.nl/files/index.php/s/2Maw8O0QTPH0oBP) was inaccessible through this browsing tool; data license/version were not verified. |
| [MWE-Finder demonstration](https://aclanthology.org/2024.lrec-main.1050/) | Generates structural queries from a canonical example; accommodates nonadjacent components | Retrieval of known expressions does not solve discovery of all unseen expressions. |
| [Parseme-NL code/data](https://github.com/gossebouma/Parseme-NL) | Conversion notebook, Alpino dictionary projection and CUPT outputs | Repository presence alone is not proof of adjudicated gold quality or complete training rights. |

[MWE-Finder code](https://github.com/CentreForDigitalHumanities/mwe-query) is public; the older UUDigitalHumanitieslab URL redirects there. [PyPI](https://pypi.org/project/mwe-query/) offers `mwe-query`, Python >=3.8,<4. The library example obtains an Alpino parse and creates precise, near-miss and broader queries; the corpus CLI asks for a BaseX database. [Dependencies](https://github.com/CentreForDigitalHumanities/mwe-query/blob/develop/setup.py) include `alpino-query`, BaseXClient, `sastadev` and pandas. An isolated technical spike is plausible, but installation/runtime compatibility has not been tested. There is a material metadata discrepancy: [LICENSE.md](https://github.com/CentreForDigitalHumanities/mwe-query/blob/develop/LICENSE.md) says BSD-3-Clause, while setup.py and PyPI declare CC BY-NC-SA 4.0. Resolve the exact release's rights before product adoption; paper access does not license all linked resources.

## Proposed experiments, in priority order

All variants should process the same frozen source sentences, with no collection writes during comparison.

1. **Structured sentence extraction:** token IDs plus original text; request categories above, component token IDs, canonical heading and contextual gloss. Compare sentence-only with neighboring sentences. Require an empty list when nothing qualifies. Never let a paraphrase masquerade as a source span.
2. **Category-specific passes:** general extraction versus separate idiom, separable-verb/preposition and colloquial-register passes. Union their proposals, then adjudicate. Hypothesis: better recall, with measurable duplicate and false-positive growth.
3. **Parser proposals as hints:** spaCy small/medium and Stanza produce candidate structures; compare pure LLM with identical LLM plus these hints. Keep parser disagreement visible. Do not let the hint constrain discovery exclusively, since the parser can miss the expression.
4. **Literal versus idiomatic contrast:** ask for a brief contextual gloss and whether the phrase is literal here; compare against actual dictionary definitions, including a plausible wrong sense. This targets selection correctness separately from detection.
5. **Independent verification:** verifier receives source plus candidates, without the extractor's persuasive explanation. Classify keep/reject/uncertain, repair boundaries separately, permit rejection of every candidate. Then measure errors introduced as well as removed. [MorphoFiltered-Gemini](https://aclanthology.org/2026.mwe-1.26/) motivates testing linguistic post-filters but reports a precision/recall trade-off, not a free improvement.
6. **Reasoning/model ablation:** hold input and schema constant while changing one model or reasoning setting. [IPN](https://aclanthology.org/2026.mwe-1.24/) found only limited language-dependent benefits from adding generated thinking during tuning; this does not predict an inference-time reasoning win for our task.
7. **Residual discovery and audio repair:** examine sentences left without expressions, plus disagreements and suspected ASR noise. A second independent extractor can find omissions; uncertain words should route to a short audio recheck instead of confidently generating a slang article. Compare marginal recovered correct items per extra request.

## Evaluation and evidence contract

Freeze a challenge set before model calls, stratified across news, interview and comedy; retain clean author subtitles and ASR as distinct strata. Include literal near-misses, ordinary prepositions, negation, particles far from verbs, pronoun variation, slang, false starts and sentences with no target. Reserve unseen sentences for transfer rather than repeatedly tuning on the same examples.

Store `sourceHash`, sentence/cue IDs, immutable token IDs and character offsets; expression membership is a **set/list of token IDs**, potentially noncontiguous or overlapping. Keep `canonicalHeadword` separately. Compare tokenization systems by mapping their offsets onto one evaluation tokenization. Code rejects nonexistent tokens, altered source quotes and unsupported references.

Primary metric: one-to-one exact component-set precision/recall/F1. Report partial token overlap separately as a diagnostic, never as an exact success. The [PARSEME 2.0 task report](https://aclanthology.org/2026.mwe-1.33.pdf) explicitly separates MWE-based exact and token-based partial scores; Dutch remains difficult across submitted systems. Score boundary errors, category errors, heading quality, contextual sense, dictionary coverage and learning usefulness independently.

Use certain labels as the strict core; optional/borderline labels as a separately reported acceptable set, not automatic false positives or hidden extra recall credit. Keep unresolved judgments explicit and adjudicate a random sample, including unanimous model successes. Two model votes are correlated evidence, not human gold. Report denominators, per-category errors, repetitions, latency, tokens and actual request counts. A small operator-labelled challenge set supports regression comparison; it does not establish full-video recall or native-speaker quality.
