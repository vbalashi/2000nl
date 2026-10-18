# Агентный поток v0: контекстный resolver с инструментами

2026-10-18. #742/#745/#747, proposed pilot design; не implemented feature.
Основание: владелец просит спланировать именно агентную последовательность с
самостоятельным выбором дополнительных tools, а не одиночный LLM JSON ответ.
[Первый supervised pilot](../pilot/RESULT-20261018.md) не проверял эту автономность.

## Реальный experiment checkpoint

[Azure Responses / Agents SDK результат](RESULT-AZURE-20261018.md):17real requests,
четыре read handlers, same-video12cases. Model tool calls работают; output/reference
и incomplete-search failures сохранены. Это partial prototype, не готовый production
resolver. Исходный proposed design ниже сохраняется; фактические ограничения и
prompt iterations в отчёте.

## Что запускаем первым

Один resolver agent, четыре read tools, ограниченный loop, source/lookup fixtures
уже выполненного video pilot. Никакого model-facing SQL, write tools, SDK swarm,
поиска по всему интернету или переписывания scheduler. Агент может запросить новую
информацию; программу продолжения/остановки исполняет runner. Unresolved — terminal
outcome задачи, не автоматическое создание второго агента.

Прототип сначала в research scripts вне приложения; handlers локальные функции.
HTTP API и MCP сервер для первого эксперимента не обязательны. Позднее HTTP/MCP
могут оборачивать те же доменные handlers с authorization, не менять semantics.
Нынешний operator psql adapter **не выдаётся** модели: handler проверяет task-bound
candidate IDs и разрешённые операции, исполняет только read domain operation.

## Три отдельных смысла API

1. Model API: отправляем instructions, task/context, definitions of tools и историю;
   получаем final output либо structured function call(s).
2. Domain tools: наш runner проверяет tool name/schema/scope/budget и вызывает
   локальный handler либо свой server API. Ответ связывается с model call ID.
3. Product commands: создание/добавление collection отдельным coordinator после
   проверки plan/authorization. В resolver-v0 tools записи отсутствуют.

Инструменты описываются в API request именем, назначением и JSON schema аргументов.
Запись названия tool в prompt сама по себе не включает execution. У модели нет
автоматического знания/доступа к нашим server endpoints: registrar/dispatcher
связывает объявленное имя с конкретным handler. Не исполнять имя функции из строки
через eval. Tool result/error возвращается в следующий model turn; модель решает,
достаточно ли evidence, повторить ли поиск с другой query или завершить задачу.

## Stage routing

| Стадия | Кто запускает | Input → output | Agent loop? |
| --- | --- | --- | --- |
| Source capture | code | URL/source → frozen author NL cues + receipt | нет |
| Structured preparation | code для subtitles; extractor role для mixed list | source + language goal → validated candidate/context packets | mixed-list tool loop позже при необходимости |
| Fast lookup | code | unique form/lemma/expression queries → ordered existing shortlist | нет |
| Fast resolution | code | only proven identity+compatible single sense → resolved | нет; single string match недостаточен |
| Context/identity resolver | code выдаёт work items | candidates + contexts + shortlist → resolved/excluded/not_found/needs_user | да, read tools |
| Deterministic output gate | code | exact IDs + refs + plan revision → mechanically valid decisions/error | нет; не проверяет всю лингвистическую истину |
| Residual routing | code | unresolved reason → retry after real new evidence / user choice / draft queue / stop | сам по себе не новый агент |
| Personal draft role | code после разрешённой missing queue | target identity + context → generated private draft | сначала one-shot, позже read tools при необходимости |
| Collection plan/apply | code | authorized selected existing/saved IDs → receipts | нет resolver write tools |

Fast resolution проверяет происхождение формы и отсутствие конфликта POS/context
и источников. Tank lookup с несколькими смыслами обязательно в resolver; стальная
форма, совпавшая с stelen, тоже не fast success. Где это нельзя надёжно проверить,
в v0 лучше отправить в resolver, чем назвать «однозначным» по count=1.
Known не влияет на source membership; default first sense применяется без context
внутри разрешённого lexical owner, не для произвольного первого search result.
Teacher gloss любого языка может задавать semantic context.

## Tools resolver-v0

| Имя | Аргументы модели | Handler возвращает | Что ограничивает сервер |
| --- | --- | --- | --- |
| `context_read` | candidateId, window=sentence/neighbours | source-faithful bounded text, language, occurrence IDs/offsets/cues | только источник этого job; neighbours максимум1 с каждой стороны |
| `dictionary_search` | candidateId, query, mode=surface/lemma/expression/evidence | exact/form/lemma candidates или example evidence, ordered IDs, cursor/completeness, relation | task scope/user language, query length, results≤10, no cross-user leakage |
| `entry_read` | candidateId, entryIds | выбранные полные sense summaries, definitions/examples/usage, stable sense order, content bindings | readable IDs из текущего task search ledger, максимум10; bounded payload |
| `morphology_suggest` | candidateId, surface | lemma/POS/form proposals, method/version, uncertainty | original-span relation проверяется; это suggestion, не proof identity |

Для `entry_read` результат search должен позволять выбрать exact stable target,
включая dictionary/homograph group; source dictionary order виден явно. Evidence
hits не заменяют independent expression target. Cursor читается bounded policy;
если выдача усечена, not_found запрещён: returned `deferred`/нужно продолжение.
Потребность дочитать search page выражается task-bound opaque result cursor; v0
может вернуть needs_search_continuation coordinator вместо разрастания tool surface.
Списки/коллекции пока читает coordinator и при необходимости прикладывает краткую
сводку; позже tool `collection_read` с owner/access checks. Веб/корпуса в v0 не нужны.

Пример реального function-tool schema: [context_read.json](context_read.json).
Strict schema гарантирует форму аргументов, а не правильность выбранного смысла.
Описание tools и роли хранить версионированно рядом с handler schemas/tests;
модель получает их явно в каждом request/связанном контексте, не читает эти файлы сама.

## Что передаём resolver

Версии policy/source/catalog, target language, approved task objective, immutable
candidate/occurrence IDs и original spans, lemma proposals с method, compact context,
first lookup shortlist с explicit group/sense order, match provenance и completeness,
previous tool evidence refs и remaining budget. Principal/credentials остаются
в runtime context, не в JSON authority модели. Text subtitle/list/teacher gloss
всегда untrusted content, не tool instructions.

Одна задача может объединять несколько occurrences одной формы, но distinct
contexts сохраняются. Candidate batches5–10 — гипотеза для measurement, не optimum.
В каждый request не добавлять весь transcript/все246 entries. Более широкий контекст
модель добирает `context_read`. Output per occurrence/group может выбрать несколько
смыслов, если evidence действительно показывает их, с привязкой к соответствующим
occurrences. Нельзя размножать все значения «на всякий случай».

## Наблюдаемый пример цепочки

Task: source surface `stalen`, context «stalen brug», initial lookup `stelen`.

1. Resolver видит несоответствие material adjective и verb stealing.
2. `context_read(candidateId, neighbours)` → подтверждает контекст моста.
3. `morphology_suggest(candidateId, stalen)` → proposals, не разрешение принять их.
4. `dictionary_search(candidateId, stalen, surface)` и при необходимости иной
   обоснованный lexical query → read shortlist, затем `entry_read`.
5. Если правильного adjective target нет, final not_found/unsupported_representation;
   noun staal не подставлять автоматически как ту же identity. Existing stelen
   не выбирать только потому, что поиск вернул один результат.

Для tank с двумя definitions обычно хватает initial shortlist: final sense2 без
дополнительных tools. Для unknown expression разрешены context→expression search→
evidence search→entry read; если есть лишь literal word/example hit, вернуть unresolved.
Это возможные ветки по данным, а не обязательные четыре запроса на каждое слово.

## Результат и остановка

Machine-readable result: decisions[{candidateId, occurrenceIds, outcome,
selectedTargets[{entryId, contentNodeId|null}], basis, evidenceRefs, reason}],
unresolvedReasons и requestedUserClarifications. Outcomes:
resolved / excluded_noise / not_found / needs_user / deferred_budget /
needs_search_continuation. Basis: contextual / first_sense_no_context.
Нет свободно придуманного sense UUID и нет output `confidence=.99` как authority.

Предлагаемый стартовый envelope на5candidate task: максимум4model responses,
6total tool calls,2distinct additional searches/candidate, context payload bounded;
absolute deadline120s и заранее заданные monetary/token caps. Числа proposed и
должны пройти measurement; unknown price/cap configuration блокирует paid execution.
Per-response output cap и cumulative input/output budget разные; growing tool history
тоже платный input. Параллельность между tasks планирует code, не модель.

Stop при final response, budget/deadline/cancel, повторе одинаковых requests без
нового evidence, исчерпании authorized search scope или нерешённом user choice.
За одну mechanical output validation error можно вернуть error feedback в рамках
того же envelope; counters не обнулять. Лингвистический mismatch не лечится простым
JSON retry. Остатки не запускают recovery бесконечно без нового основания.

## Runner sketch (псевдокод, не live API implementation)

```text
load frozen task and persisted run budget/history
while within caps and not cancelled:
    response = model(instructions, tools, task, preserved_history)
    persist response, request receipt and usage
    if response has tool calls:
        for call in response.tool_calls:
            validate allowed name, schema, task scope and remaining budget
            result = dispatch_to_allowlisted_read_handler(call)
            persist tool receipt; append linked tool output
        continue
    if response is completed with structured final output:
        return validate_ids_occurrences_access_and_revisions(response)
    classify incomplete/refusal/transport_pending; stop or reconcile boundedly
return per-item deferred outcomes with reusable checkpoint
```

Сохранять required response items/continuation state согласно конкретному API;
не передавать только видимую текстовую реплику, теряя function calls/call IDs или
нужные reasoning items. Строки tool result могут содержать валидированный compact JSON.
Provider request in-flight сначала reconcile; persisted state не очищается при
restart. Ответ модели «готово» не является durable job receipt.

## API/runtime choice для первого prototype

Предложение: небольшой явный Responses API loop поверх общих domain handlers.
Так видно каждый request/tool result и удобно сравнить one-shot с bounded loop.
Альтернатива — Agents SDK, который управляет turns/tools, structured agent outputs,
handoffs и tracing. SDK удобен при росте потоков, но не заменяет нашу durable queue,
authorization, semantics, source privacy, idempotent Apply и cost reservations.
Model/provider сейчас не закреплён; compatibility tool support/structured outputs
нужно проверить при выборе. API key для документационного дизайна не нужен.

Современные средства: function tools, structured outputs, retrieval, MCP, context/
session continuity, specialist handoffs, parallel read work, traces/evals. Это набор
механизмов, не гарантия доменного качества. Для нашего v0 достаточно function tools,
structured output, context loop и persisted task; отдельный router agent не нужен.
Generative role и extraction role могут использовать тот же model с другими prompts
и разными allowlisted tools. «Нерешённое» не требует автоматически другого model.

## Первый автономный эксперимент

1. Freeze12cases из нашего video: easy single, tank2, DENK/denken, stalen/stelen,
   wrong lemmas, separable verbs, embedded-only idioms, missing, same lemma different
   contexts. Supervised collection — review material, не независимый gold standard.
2. Implement local handlers + fake model replay; проверить tool chaining,
   unauthorized IDs, truncated search, malformed args, no-progress loops и resume.
3. После выбора provider/budget — bounded paid run в read-only/dry-run. Сравнить
   one-shot shortlist против того же model+tools на одинаковых inputs. Не менять
   live collection по результату автоматически.
4. Просмотреть decisions/traces, считать correct/incorrect/unresolved отдельно,
   tool counts, retries, total tokens/cost/unknown и wall time. Полезность дополнительных
   tools должна быть видна в конкретных corrected decisions.
5. После настройки проверить на другом held-out видео/списке; этот source не
   использовать для правки правил до evaluation. Затем новая review точка integration.

## Официальные источники (проверено 2026-10-18)

- [Function calling](https://developers.openai.com/api/docs/guides/function-calling):
  multi-step application loop, tools/schema/results, tool choice и strict mode.
- [Agents SDK](https://developers.openai.com/api/docs/guides/agents/sdk): runtime loop
  в приложении с server-owned tools/state/approvals.
- [Running agents](https://developers.openai.com/api/docs/guides/agents/running-agents):
  model/tool/final/handoff execution и continuation boundaries.
- [Agent definitions](https://developers.openai.com/api/docs/guides/agents/define-agents):
  instructions, tools, output configuration и specialist boundaries.

Этот документ предлагает наш domain contract. Наличие механизмов в документации
не доказывает их доступность у любого provider/deployment и не означает, что они
уже подключены к2000NL.

## Продолжение: короткие ссылки, repair, стоимость

[Измерения v4 и прогноз стоимости видео](RESULT-AZURE-V4-20261018.md): SDK12/12, Responses11/12;
27cumulative calls ~$0.02483 по опубликованному тарифу. Не invoice и не полный video pass.
