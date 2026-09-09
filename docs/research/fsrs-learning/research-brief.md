# Optional independent research brief

Investigate first exposure, intraday learning, and workload simulation for a vocabulary app using FSRS-6. This is research, not authorization to modify code or select a new algorithm. Use dated primary sources and version-pinned Anki/FSRS implementations. Separate verified behavior, empirical evidence, assumptions, and recommendations.

Context: users reveal a new vocabulary card and press Learn to enroll it. Later they explicitly rate recall with Again/Hard/Good/Easy. A separate Known mark excludes a card without erasing memory state. Our immediate problem is missing enrollment history and a New counter that only counts first graded cards whose current interval is at least one day. We are comparing retaining enrollment as an event with treating Learn as an initial Again. Do not assume either policy is settled.

Answer these bounded questions:

1. In the specified Anki + FSRS-6 version, when are stability/difficulty initialized and updated during configured learning steps? Show relevant code paths for first Again, Good, graduation, and relearning. Distinguish scheduler state, due time, memory state, review log classification, and optimizer treatment.
2. Compare an ungraded first exposure/enrollment, a first Again, and an explicit short learning step. What information does each assert about memory? How should history, lapse counts, first-review statistics and parameter fitting distinguish them? Include whether and how an enrollment can be represented without fabricating a recall outcome.
3. What evidence compares fixed short first repeats with FSRS-selected short intervals for vocabulary, controlling study time? Separate recall-prediction accuracy, retention, time cost, randomized learning outcomes and subjective confidence. Do not claim one interval or algorithm is universally best.
4. Describe precise handling of elapsed minutes, midnight/day cutoff, time zones, same-day updates and sub-day interval rounding. What parity tests should a Postgres FSRS implementation use?
5. Recommend a reproducible workload simulation design for 5-new/10-review, new-only, interruption, 50/100-new bursts, missed days and finite collections. Specify inputs, seeded answers, independent learner models, sensitivity analysis and outputs. Separate first coverage from sustained retention; avoid proving a scheduler using only itself as the simulated learner.
6. Only if a verifiable benchmark is relevant, distinguish modern SuperMemo algorithms from SM-2 and identify exact versions and evaluation metrics. Do not infer which unidentified “Memory” application the user remembers. Explain whether any comparison justifies an engineering change in this app.

Deliver a concise evidence table, a version-pinned worked timeline for each initial-learning policy, proposed parity cases, material uncertainties, and a recommendation scoped to observability and first-learning semantics. Cite exact source locations and flag any contradictory guidance in the supplied historical PDF. Do not assume the PDF accurately describes today's app.
