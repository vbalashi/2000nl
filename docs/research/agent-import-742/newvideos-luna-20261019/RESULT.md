# Luna high на двух новых видео: результаты

2026-10-19, #742 / draft PR #748. External research, не production integration. [Входы/порядок](README.md), [решение о20шагах](../../../discussions/2026-10-19-05-measure-agent-steps-before-limits.md).

## Протокол и фактические изменения

Первый проход видит все подготовленные предложения и возвращает конструкции с неизменными token IDs. Спецификация/structured output проверяет ID coverage, границы и дубликаты. Это не независимая лингвистическая оценка. Слова/леммы подготовлены детерминированно, их полное разрешение по значениям в этом эксперименте не выполнялось.

Второй проход получает исходные first-pass proposals и выбранные max32cases: до8flagged,16nonempty,8empty-long с равномерным распределением по source positions внутри strata. Никаких gold expressions или ответов Sol/DUCAME. Доступны4инструмента: context_read, source_search, dictionary_search, entry_read. Dictionary principal задаёт оператор; модель не получает user identity/SQL. Поиск имеет finite result limit и не доказывает глобальную dictionary absence. Короткая entry projection и более подробная entry_read различаются; truncation помечается.

Исходный4turn pilot на LUBACH исчерпал лимит, параллельный sibling лишился соединения при отмене. Raw requests/responses и tool traces сохранены; два пакета отдельно завершены no-tools вызовами из фактически записанной истории. Их исключения, финализации и стоимость не скрыты. Временный вариант завершал новые задачи после2tool outputs; он сохранён как review4, **не считается измерением естественной длины**.

По прямому поручению владельца выполнен отдельный review20: natural tool choice, без forced dictionary first и forced finish после2tools. Он читает первоначальный baseline, а не corrected review4. Последующие параллельные batches сначала завершаются/сохраняются, затем координатор поднимает ошибку; одна неудача больше не отменяет незавершённые siblings. Generic recovery остаётся исследовательским, не production job queue.

## Источники

- LUBACH `-mOpU9Wf-wg`:11:32, авторские `nl-NL` captions166cues. Provider code сохранён, canonical language нормализован в nl; первая попытка старого guard rejected regional code и не была выдана за успешную загрузку.
- Easy Dutch `_XskmnKYQRs`, WEDDING Vocabulary:15:48; авторской NL дорожки нет. Собственный AudioFilms full-audio ASR дал342cues; job07:50:18.027Z→07:55:41.207Z,323.18s. Это retrieval+transcription, не inference-only benchmark и не доказательство лучшего WER. Runtime/auth/deployment AudioFilms не менялись. Явный операторский cap1200sec допускает948s source; прежний default900sec сохранён.

Raw transcripts, словарные определения, owner identity, prompts/responses и ASR receipt IDs находятся только в ignored `tmp/agent-import-742/newvideos-luna-20261019/`. В Git агрегаты, hashes и короткие учебные примеры.

## Интерпретация качества

На LUBACH first pass106units, targeted natural review107:3added token-sets и2removed; одна пара — правка границ одной и той же collocation. Net+1 не означает одну дополнительную правильную идиому. Отдельно видны:

- `weggepest` → `wegpesten`: полезная словарная лемма, тогда как spaCy предложил NOUN/lemma weggepest. Но joined ordinary verb выходит за текущий MWE-only output contract; это кандидат для словного потока, не доказательство новой идиомы.
- `of niet`: добавленная вопросительная формула, её учебная полезность зависит от product policy.
- `het mag wat kosten`: исходный кандидат связан с авторским `costa`, вероятной игрой слов. Модель назвала это возможной ASR-ошибкой, хотя источник author captions. Нельзя молча подменять pun на исправленное слово; удаление в review тоже не доказывает ошибочность первого обнаружения. Следующая версия входа должна явно передавать provenance, а не только sourceHash.

На Easy Dutch181→183units:4added cores/2removed, из них две пары — boundary changes, а не четыре новых выражения. Review исключил переменный объект `ringen` из ядра `omhebben` и переменное `degene` из `dicht bij iemand staan`, что соответствует принятой lexical-core policy. Дополнительные `ver weg staan` и `best wel` остаются учебными кандидатами разной специфичности, не автоматически approved idioms. Четыре изменения canonical heading при одинаковых токенах учитываются отдельно, не как новые находки.

Это маленький наблюдаемый before/after, без independent/native-speaker gold и без control reread на тех же источниках. Не устанавливаем recall/precision проценты и не считаем все additions полезными. First-pass extraction coverage не равна all-word sense resolution или готовой коллекции.

## Измерения

Оба источника завершены; все first-pass case IDs покрыты, все59targeted review case IDs покрыты, механических invalid units0.

| Источник | Все предложения первого прохода | Lemma/POS candidates | First-pass constructions | Targeted review sentences | После review |
|---|---:|---:|---:|---:|---:|
| LUBACH |135|411|106|27|107|
| Easy Dutch |343|440|181|32|183|

15natural review tasks использовали3–8model turns, median5. Распределение:3turns×2tasks,4×4,5×2,6×2,7×3,8×2. В9из15пакетов естественная длина превысила4turns; ни один не достиг20. Turn здесь — один model request/response, не отдельный исполненный Python tool handler. Всего81modelcalls в natural review:66tool calls и15финальных ответов. Фактически использованы context_read41 и dictionary_search25; source_search/entry_read были доступны, но не понадобились. Точных повторов одинаковых name+args0, tool errors0.

First passes60modelcalls + natural review81 =141successful calls. Их published token estimate **$0.104082185**:471226input (423ordinary,271926cached-read,198877cached-write),152922output. С учётом первоначального review4 и recoveries весь эксперимент165requests/164recorded responses, **$0.115522035 по known usage плюс один неоценённый interrupted request**. Нельзя считать этот неизвестный вызов бесплатным. Все записанные HTTP statuses200, usage input+output totals согласованы. Rate unitUSD/million tokens:input.10/read.01/write.125/output.50, проверено2026-10-19. Это не billing invoice и не стоимость всей инфраструктуры.

[Машиночитаемый итог](RESULT.json) содержит per-task turns/toolnames/timings, UTC-bounds phases, before/after changes и ограничения. Phase spans07:52:56.559Z→08:07:29.173Z (extract+legacy review) и08:01:46.488Z→08:09:48.535Z (natural review20). Они частично перекрываются, их длительности нельзя складывать как end-to-end time.

Все model calls используют Azure deployment gpt-6-luna, high reasoning, Responses через Agents SDK. Tracing disabled,store=False,retries0; ошибочные/прерванные попытки входят в requestcounts. Публичная цена — оценка known usage, неизвестный usage не считается бесплатным; ASR/CPU/hosting/SQL не монетизированы, invoice не сверялся. [Опубликованные ставки](https://azure.microsoft.com/en-us/blog/gpt-6-astra-sol-and-luna-for-production-agents-in-microsoft-foundry/), [tool semantics](https://developers.openai.com/api/docs/guides/tools).

## Проверки и дальнейшая граница

Focused tests покрывают selection strata, case isolation, запрет произвольного entry ID, bounded context, повторный вызов, recovery только при recorded tool evidence, отсутствие forced finish в20turn режиме и отделение boundary repair от нового выражения. Captions adapter проверен синтаксически, ASR provenance tests проходят. UI/DB schema не менялись, поэтому app build/FSRS suite не запускались.

Приложение, пользовательские коллекции, dictionary articles и learning progress не записывались. Наличие read-only dictionary tools не означает, что все значения уже выбраны. Рабочий production turn limit пока не выбран — цель текущего опыта измерить естественную длину, как попросил владелец.
