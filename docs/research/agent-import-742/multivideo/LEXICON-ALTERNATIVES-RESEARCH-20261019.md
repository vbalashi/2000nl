# DUCAME availability, annotation runtime and lexical alternatives

Date: 2026-10-19. Research for #742; not production adoption. Follow-up to [MWE methods](MWE-METHODS-RESEARCH-20261018.md). Primary documentation and public release archives were inspected. Archive bytes were read in memory without installing or executing their code. No restricted corpus, login, license acceptance, model call or database write was involved.

## Public DUCAME data is available inside a release

The authors' [DUCAME SURFdrive link](https://surfdrive.surf.nl/files/index.php/s/2Maw8O0QTPH0oBP), cited by [Odijk and Kroon](https://aclanthology.org/2024.lrec-main.8/), was not accessible through the browsing tool. This is no longer a technical blocker: the official [mwe-query 0.2.0a2 PyPI source distribution](https://pypi.org/project/mwe-query/0.2.0a2/) bundles the canonical lexicons. Its release manifest is available through the [public PyPI JSON API](https://pypi.org/pypi/mwe-query/0.2.0a2/json).

Inspected artifact: [mwe_query-0.2.0a2.tar.gz](https://files.pythonhosted.org/packages/73/cf/04fd7181acd5732da8801f68648d1df006412ab5e4ace410f6dbe2d74b3b/mwe_query-0.2.0a2.tar.gz), SHA256 `68766096899220bb4b5e9fd953c58e7187f8ee216d2bd77d2abac21d1b565edf`.

It contains `mwe_query/mwelexicon/DUCAME_3.0.txt`, `DUCAME_4.0.txt`, and versions `4.01` through `4.05`. Version 4.05 is 560,974 bytes and 13,389 physical lines including its header; this is an inventory count, not a claim of 13,388 distinct accepted expressions. The tab-separated columns are `MWE_ID` and `Canonical_Form`. Forms contain the authors' annotation syntax for lexicalized components, open arguments and variants. Strip neither punctuation markers nor argument notation by an improvised string rule when constructing structural queries.

The alpha also bundles an Alpino lexical projection, reflexive/particle exception lists and a lemma index. Stable 0.1.0 contains tooling but not these complete lexicon directories. Therefore specify the alpha explicitly for the lexicon experiment and preserve its hash; installing the stable default alone does not reproduce the same data.

## Exact-release license discrepancy remains unresolved

I inspected all three public source distributions, not merely the current GitHub page:

| Release | Bundled `LICENSE.md` | Bundled `PKG-INFO` |
| --- | --- | --- |
| 0.1.0 | BSD 3-Clause | `License: CC BY-NC-SA 4.0` |
| 0.2.0a1 | BSD 3-Clause | `License: CC BY-NC-SA 4.0` |
| 0.2.0a2 | BSD 3-Clause | `License: CC BY-NC-SA 4.0` |

These artifacts are discoverable through [PyPI release JSON](https://pypi.org/pypi/mwe-query/json). Their SHA256 values are respectively `61ea13b29c7bb5664a953f6fefa516aea6eb4a1f7f946884961dd8a74ae09bd7`, `77b7b4ba0ab0f0cd7b89d9bf55c690decbab5a25a863058b477dd78f1a86405c`, and the alpha2 hash above. Current [GitHub LICENSE](https://github.com/CentreForDigitalHumanities/mwe-query/blob/develop/LICENSE.md) and [setup metadata](https://github.com/CentreForDigitalHumanities/mwe-query/blob/develop/setup.py) show the same discrepancy. This is not explained by choosing a historical release.

Public accessibility establishes technical reproducibility, not that all bundled lexicons carry BSD terms. I found no unambiguous per-resource DUCAME license in the inspected material. Do not silently promote this research dependency or copy its lexical content into shipped dictionaries. No maintainer was contacted; clarification remains an adoption task. [DuELME's owner page](https://taalmaterialen.ivdnt.org/download/tstc-duelme/) separately points to commercial-use terms, so it is not an automatically unrestricted replacement.

## Full automatic annotation exists, but the package is not turnkey

The alpha source contains more than the README's single-expression query demo:

- `mwe_annotate.py: annotate(syntree, sentenceid)` returns three lists: accepted, discarded and duplicate `MWEMeta` records. It derives lemma candidates, consults the lexical indexes, expands the input tree and applies structural matching. It also incorporates Alpino-derived MWEs.
- `annotatetreebank.py: annotatefile(filename)` is a file wrapper. Its CLI accepts `-i` XML input directory, `-o` output directory and `-u` corresponding UD directory, and writes metadata/CUPT-oriented outputs.
- `indexes.py` selects `DUCAME_4.05.txt` and expects an `Indexes` object with MWE-ID mappings, lemma postings and parsed MWE trees. The archive includes `indexes/mweindex.json` (1,239,420 bytes).

**Crucial missing artifact:** the source archive contains no XML files, including the expected `indexes/mwelexicon_treebank.xml`. The JSON index supplies identifiers and lemmas, not the parsed canonical-expression structures required for full matching. Importing `indexes.py` triggers an update and writes files. Its update checks the missing treebank's modification time without a guard; rebuilding can subsequently call `sastadev.alpinoparsing.parse` for uncached expressions. Avoid an accidental full-lexicon parse job simply by importing the module.

Other portability issues visible in source: top-level sibling imports coexist with relative imports; paths such as `./indexes` and `./mwelexicon` depend on the current directory; `lexicons.py` asks for `irv_lexicon.xlsx`, whereas the archive contains `IRV_lexicon.xlsx`, which matters on a case-sensitive filesystem. Some demo defaults contain the author's Windows paths. These are source-inspection findings, not a completed execution failure report.

**Bounded experiment recommendation:** freeze a lexicon version, shortlist candidates by recorded lemma index, parse only those canonical forms into an explicit cache, then call the actual query-generation/matching code. Record how many of the full lexicon were considered and parsed. Compare precise structural matches separately from near-miss/broad lemma matches; the latter are review candidates. Input sentences still need Alpino XML, either from a locally installed parser or an explicitly bounded parser service. Fully offline operation needs both the parser and all required cached canonical parses. BaseX is useful for the corpus-query CLI; it is not intrinsically necessary to evaluate XPath against a small in-memory set of already parsed sentence trees.

## Additional non-LLM baselines worth running

**A. Alpino-native construction detector.** Alpha `getalpinomwes.py:getalpinomwes(syntree, sentenceid=None)` returns lexical classes, heads and component positions using original Alpino relations and exception lists. It recognizes selected prepositional complements (`pc`), inherent reflexives (`se`), separable particles (`svp`), joined particle lemmas, and interactions between them. This is richer than our two generic UD proposal rules. It does not need the missing full DUCAME parsed-treebank, though its imports and lexical files still require an isolated compatibility adapter. Keep it separately scored from DUCAME structural matches to measure each source's contribution.

**B. Lexically constrained UD patterns.** [Parseme-NL](https://github.com/gossebouma/Parseme-NL) publishes [alpino_dictionary.json](https://github.com/gossebouma/Parseme-NL/blob/main/alpino_dictionary.json): current inspected data has 1,369 records across 205 root lemmas. Its [conversion notebook](https://github.com/gossebouma/Parseme-NL/blob/main/Parseme-NL.ipynb) matches a verb lemma plus a lexical dependent for object/subject constructions, in addition to particles/reflexives. This can reuse existing Stanza parses while adding lexical discrimination. The notebook is research code with hard-coded corpus paths and an apparent stray literal line inside one code cell; use a small characterized adapter, not unattended notebook execution. Dataset-specific licensing remains to be established before redistribution.

No ready-to-run, licensed Dutch MWE-specific pretrained checkpoint was verified in this investigation. General Dutch tokenization/MWT models are not expression detectors. Training from PARSEME is a later option requiring verified corpus rights and training/evaluation separation. For the immediate pilot, Alpino-native detection plus the packaged DUCAME shortlist offers the most concrete independent evidence without assuming either one will beat the LLM.
