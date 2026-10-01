# Aandoen usage and verb morphology rendering

2026-10-01. UI owns this correction. Source evidence: /Users/khrustal/dev/2000nl/db/data/words_content/000031_a31_aandoen_ww_3.json. definition=kort bezoeken, context=iemand doet een plaats aan, example=het schip deed de haven van Rotterdam aan, idioms=[]; raw HTML places the context in brackets after the definition. No source data changed.

Context is correctly normalized as usage-pattern. The UI incorrectly lumped all non-examples into Expressions & usage. ArticleMeaningDetails now separates examples, usage patterns, idioms and remaining notes, preserving node IDs and child ownership. EN/NL/RU headings match each role.

Morphology regression: the preceding shared header sizing selector applied width/height 32px to every header button, including ArticleWordForms disclosure. Repro in browser at 738×954: width32, height32, width>100 verdict false. Scoped size to sense-card-header-actions only. Same original probe after reload: width358, height56.375, verdict true. Perfect phrase is complete and disclosure opens the actual conjugation table.

Regression test sharedArticleReading: usage is separate from idioms/examples, red before the change, green after. 40 tests passed across sharedArticleReading, wordDetailsPresentation and LibrarySenseCardGroup. Typecheck passed. Lint retains existing handlePlayAudio warning; forms tests retain existing inert boolean warning. No debug instrumentation added.

Prevention: scope icon geometry to its explicit action group, not every button within a composite article header.

Evidence: /Users/khrustal/adhoc/2000nl-407-visual-evidence/r6-aandoen.png. Owner review remains open.
