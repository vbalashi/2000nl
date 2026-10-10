# Luna6 tuning and relative promotion

2026-10-10, owner explicitly authorized: tune Luna6, compare against GPT4.1 on
100 new examples; if advantage persists and serious errors do not increase,
switch primary model to Luna6 with rollback. Supersedes absolute95% promotion
veto for relative replacement; does not declare semantic quality solved.

Freeze before new validation: use prior100 as development, one20-case targeted
Luna6 pilot (old failures plus controls), then freeze one candidate. New100:
unique headwords disjoint from all earlier cases, same six source strata and
70RU/30EN. One draw per model: tuned Luna6 versus common v4 GPT4.1 (the prior
comparison baseline, stronger than production v1; no handicapped baseline).

Gate: Luna6 strictly more fully acceptable responses, no more responses with
sense/content score<=2 (serious errors), and no more critical role/negation/
obligation reversals. Report score3 errors separately. Agent review is preliminary
and non-blind; archive exact outputs and provide anonymous human page. Do not
change thresholds after results. If gate passes implement primary model/prompt
selection and rollback; deploy only via the documented release path, verify
production configuration/provider availability and keep prior option available.

Budget:20 development pilot+100×2 validation=220 initial calls; transient recovery
up to3 retries per failed input separately logged/counted. No semantic judge call
per production translation, audio or complaint review. Research stays #657/PR658.
