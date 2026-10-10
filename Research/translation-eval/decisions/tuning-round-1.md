# Tuning round 1 — before round 2

18/18 calls complete, source commit 763890e0. No validation executed.
Non-blind agent inspection of all six outputs per model:

- GPT-4.1: 4 accept / 2 needs-work. gemakkelijk primary/base «легко» (adverb)
  violates adjective POS, although the example adjective is right. Idiom
  explanation still has «о обычных». v2 adds entry POS and Russian preposition
  allomorph checking. Difficult definition is now natural «непросто…».
- Luna 5.6: 5 accept / 1 needs-work: «не лёгкий» persists; add general Russian
  negation orthography/idiomatic positive-definition check. Easy definition
  now preserves both activities and is natural.
- Luna 6: 6 accept / 0 needs-work. Keep exact v1 prompt text as v2 and repeat
  same development inputs to use the same second-iteration budget. Former
  definition relation error is absent. Idiom «о всякой всячине» is acceptable.

Speak as an additional equivalent of conversational praten is contextually
possible but broader than talk/converse: equivalentUsefulness=4, not a mandatory
failure on these full contexts. Control cow remains without invented variants.
No architecture-based claim about model differences is made.
