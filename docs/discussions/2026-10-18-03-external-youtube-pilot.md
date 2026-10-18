# 2026-10-18: внешний YouTube pilot до интеграции

Владелец поручил подготовить staged external pilot вместе с ним, до встраивания
в приложение. Видео: https://www.youtube.com/watch?v=8_WR5b2FJfY . Отдельно
прорабатывать этапы, scripts/tool calls, server boundaries, libraries/resources,
accuracy/time/cost. Runtime/production writes и массовые paid runs не разрешены.

Уточнено: extraction возвращает structured surface/lemma/context JSON до lookup;
контекст — sentence/neighbours/teacher gloss, не выдуманное предложение. Mixed list
может быть NL/FR/RU/EN; language goal из задачи/активного учебного scope, при
неясности спросить. Не считать английский единственным языком подсказки.

Known values обязательно остаются в collection, пригодной другому ученику; их
персональная видимость/eligibility относится к training. Предложение исключать Known
при сборке collection из предыдущей дискуссии отменено. Noise/standalone function
word policy отдельна и не удаляет tokens до phrase detection.

Нужна оценка parser/rules для verb-preposition/particles: воспроизводимый rule
не гарантирует истинность статистического parse. Batch lookup спроектировать и
измерить, а не считать готовым по наличию single lookup. Plan и scripts пока proposed.

[План и совместные review checkpoints](../research/agent-import-742/pilot/PLAN.md),
[primary-source NLP options](../research/agent-import-742/nlp-options.md).
Следующий этап0: source/track freeze, затем реальные candidate packets. Caption fetch
ещё не выполнялся; web metadata fetch не подтвердил название/язык/длительность.
