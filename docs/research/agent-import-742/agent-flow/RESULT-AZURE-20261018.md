# Реальный Responses / Agents SDK pilot через Azure

18 октября2026. #742/#745, external pilot вне app, owner разрешил первый API/SDK
эксперимент. Достаточно существующего видео8_WR5b2FJfY:12замороженных сложных случаев
и finite owner-readable VanDale snapshot первого supervised pilot. Другой источник
сохраняем для held-out проверки. Live collection246entries не изменялась.

## Подтверждённая совместимость

Два реальных пути отработали на существующем Azure deployment **gpt-6-luna**,
version2026-09-22, GlobalStandard/Sweden Central, существующая Sponsorship subscription:

1. `AsyncOpenAI.responses.create` → собственный function-call/result loop.
2. `OpenAIResponsesModel` → `Agent`/`Runner` OpenAI Agents SDK → тот же Azure client.

Реальные зависимости: openai3.35.1, openai-agents0.24.0, Python3.12, local CPU tools.
Никакой new Foundry project/hosting/deployment не требовался. Azure model list
проверен read-only до вызовов; gpt-6.1-sol также существует, но в этот comparison
не отправлялся. Entra credential извлекался в памяти, не сохранялся и не выводился.
Request guard разрешал только POST на настроенный Azure `/openai/v1/responses`,
точный deployment, `store=false`, bounded payload и output. SDK tracing/export
отключены; local request/result/usage journals сохранены в ignored tmp.

Официальные основы: [Azure v1](https://learn.microsoft.com/en-us/azure/foundry/openai/api-version-lifecycle),
[OpenAI SDK/runtime](https://developers.openai.com/api/docs/guides/agents/sdk).
Другие варианты и пределы подтверждения Azure availability:
[Foundry/Agent Framework и managed Agents API](azure-options-20261018.md).
OpenAI managed Agents API не объявляется доступным через наш Azure resource.

## Четыре инструмента

`context_read`, `morphology_suggest`, `dictionary_search`, `entry_read` реализованы
как local allowlisted read functions поверх frozen source/catalog. Это реальные
function calls модели, но **не deployed HTTP API словаря**. Получение credentials,
SQL и запись коллекции не входят в tools. Oracle labels в model input не передаются.

Все4handlers отдельно прошли local smoke; в естественных live runs модель выбирала
**dictionary_search**. Остальные не понадобились ей при достаточно полном начальном
context/shortlist — не выдавать это за доказательство автономного выбора всех4tools.

Наблюдаемая цепочка direct-v1:

- Вход: Denk из предложения, initial lookup=политическая партия.
- Модель сама вызвала dictionary_search(candidate=c204, query=denken, mode=lemma).
- Local handler вернул existing thinking senses и evidence reference.
- Следующий model response выбрал thinking sense, не партию.

Аналогичные реальные calls: aanpakken, uitleggen, in de gaten houden. Ни command
на каждый token, ни ручное предоставление ответа между model turns не потребовались.
[Код и reproducibility](../../../../scripts/research/agent-import-pilot/README.md).

## Итерации: успехи и неуспехи сохраняются

Это development experiment, не статистическое сравнение SDK/моделей. Supervised
решения предыдущего pilot — review reference, не независимая лингвистическая истина.

### v1: одинаковый role prompt,12cases, две партии по6

| Вариант | HTTP model calls | Tools | Wall time двух задач | Результат |
| --- | --- | --- | --- | --- |
| One-shot без tools | 2 | 0 | ~8,44s | 8/12 reference agreements после offline исправления gate |
| Явный Responses loop | 4 | 5 | ~11,62s | 12/12 reference agreements после offline исправления gate |
| Agents SDK | 3 | 4 | ~9,09s | первая6case партия valid:5/6; вторая партия rejected по контракту |

В v1 механический validator ошибочно считал допустимыми evidenceRefs только receipts
новых tools, хотя модель могла ссылаться на настоящие IDs исходных entries/content
nodes. Это ошибка harness. Исправлен validator, добавлен regression test. Исходные
ответы/usage не изменялись; первые два результата таблицы **offline revalidation
тех же live outputs**, не выдуманный успешный original live pass.

У SDK второй batch действительно содержал `not_found` с nonempty selectedEntryIds
для физического inbreken: это уже ошибка ответа модели, не gate. Проверка не
ослаблялась, такой batch не принят. SDK также оставил uitleggen и expression поиск
недоделанными, хотя tools позволяли продолжение.

### v2: свежий live pass после исправления gate и уточнения output contract

Оба варианта снова запущены на12cases, по одному разу. Direct:4HTTP/7tools/~12,77s,
первая партия6/6 valid, вторая rejected из-за придуманного evidence UUID.
SDK:2HTTP/0tools/~6,96s, первая партия3/6 valid, вторая rejected из-за опечатки в
настоящем evidence UUID. Быстрее здесь означает меньше работы/поиска, не преимущество.

У direct по смысловым selected IDs было совпадение на всех12, но ошибочную ссылку
нельзя называть валидным конечным результатом. Выдуманные evidence IDs не приравнивались
к настоящим и не исправлялись незаметно. Такой дефект показывает необходимость
коротких server-issued refs/aliases и per-item validation вместо потери всей партии.

Сравнили фактические начальные wire payloads direct и SDK: вход, инструкции, tools,
model settings и schema совпадают; обнаруженное отличие — имя output format
`DecisionBatch` против `final_output`. По этим единичным runs **нельзя** заключить,
что SDK хуже понимает Dutch или является иной/менее умной моделью. Вероятностные
outputs и schema labeling/context effects требуют повторного контролируемого теста.

### v3: узкий SDK smoke6cases, явнее retrieval policy

Новый prompt требует попробовать альтернативный поиск при semantic mismatch
initial shortlist; для initial evidence можно вернуть пустой refs list (runtime
сохраняет initial context), а tools цитируются короткими `ev_...` refs.
2HTTP/3tools/~5,04s. Полный output mechanically valid, **5/6 совпали с reference**.
Denk и uitleggen исправлены через tools, stalen не подменён stelen/staal.
Но aanpakken агент оставил not_found, не сделав нужный поиск. Инструкция сама по
себе не гарантирует полноту retrieval; этот false negative сохранён, не замазан.

v3 — другой prompt и только6cases, поэтому это не новый head-to-head score и не
подмена v1/v2 удачным числом. Бюджет предшествующих попыток наследовался через
prior-ledger hashes/counters; новые directories не обнуляли HTTP/byte cap.

## Реальные расходы и пределы

[Санитизированный полный accounting](result-azure-20261018.json).
Всего **17 HTTP requests /17 HTTP200responses**, включая development failures:
**163624 input +7002 output =170626 total tokens**, равенство проверено по каждой
квитанции. Output включает528reasoning tokens; не прибавлять их ещё раз.
Cached input subset43445. Дополнительно provider вернул cache_write_tokens120128;
это наблюдаемый field, не доказанная отдельная billed category. Эти два subcounter
в сумме на51меньше input; причину не выдумываем, billing не реконструируем из этого.
Usage известен у всех17, transport pending/unanswered=0, HTTP/SDK retries=0.

UTC starts физических requests: от2026-10-18T19:29:52.361568Z до
2026-10-18T19:34:15.853801Z включительно (Amsterdam21:29–21:34).
Это интервал request starts, не весь wall time исследования; последняя response
пришла позднее последнего старта. Указание start-inclusive/end-exclusive можно
получить как last_start+1µs; не считать соседние Azure resource calls нашим расходом.

Денежная стоимость **не подтверждена**: effective Azure prices/discounts и semantics
cache meters не сверены с billing. Не использовать исторические research rates и
не называть этот pilot бесплатным. Hard limits:18total requests с наследованием
attempts, ≤4096output/request, ≤96KiB/request, ≤768KiB cumulative request bytes,
4model responses/task и12tool attempts/task, bounded execution timeout, no retries.
Это call/payload/output bounds, **не** обещанный currency cap. Из18 использовано17;
неиспользованный остаток не запускается без нужды.

## Что теперь нужно исправить перед следующим quality run

1. Кодом обеспечить retrieval completeness: отрицательное решение по неправильному
   initial match не принимать без достаточной alternative-search evidence либо
   вернуть deferred, если budget закончился. Одного текста в prompt мало.
2. Короткие aliases для entries/evidence и server-side resolution в UUID;
   schema/legal ID checks остаются, без прощения придуманных ссылок.
3. Partial per-item output validation: один дефект не должен терять остальных5valid
   candidates, но rejected item не становится accepted автоматически.
4. Slim initial projection вместо больших raw/content-binding payloads. В данном
   run7–12kinput tokens/model request; first four tools не требуют всего provider raw.
5. После этих mechanical fixes повторить frozen cases, затем held-out второе видео
   или multilingual school list. Не объявлять autonomous quality по одному видео.

## Проверки и сохранение

10offline tests PASS: четырём read-tool boundaries, oracle non-leak, invented IDs,
initial evidence refs, non-resolved/selected contradiction, cache/principal bounds,
source offsets/repeats/particles. All4handlers local smoke PASS. Python compile/diff
и новые local links проверены. No production mutations, collection changes,
schema/migrations, app integration, API deployment или изменения old603Azure runs.

Артефакты: ignored `tmp/agent-import-742/agent-run-v1`, `v2`, `v3`, fixture рядом
с предыдущим source snapshot в owning742checkout. Payloads содержат source/dictionary
content; не публикуются в Git. Trace export disabled. Checkouts retained for active
pilot/review, not retired or merged. Результат показывает работоспособный agent/tool
loop через Azure, но ещё не достаточную автономную полноту для автоматической записи.
