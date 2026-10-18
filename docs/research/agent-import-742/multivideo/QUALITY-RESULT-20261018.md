# Три коллекции и проверка качества, 2026-10-18

Владелец разрешил создать три новые коллекции и продолжить внешний пилот.
Коллекции созданы в указанном владельцем аккаунте через существующие
owner-checked RPC, без изменения приложения, схемы или API.

| Коллекция | Итоговых записей |
| --- | ---: |
| YouTube — NOS: Oekraïne, wielrennen en blinden | 201 |
| YouTube — Easy Dutch: Complimenten | 285 |
| YouTube — LUBACH: Buiten je comfortzone | 232 |

Финальное множество entry IDs каждой коллекции повторно прочитано из БД и
сверено с manifest + отдельным gap-repair receipt, не только со счётчиком.
Перед каждой из двух операций выполнен rollback dry-run. Commit проверил
неизменность fingerprint всех пользовательских `user_card_status` и числа
`user_card_action_events`. Known не фильтровались. Новых словарных статей нет;
десять generated drafts остаются вне БД. Создание коллекции не запускает обучение.

## Реальный проход

Сохранённые author captions NOS и собственные AudioFilms ASR Easy Dutch/LUBACH
повторно не скачивались и не транскрибировались. Из 1005 извлечённых кандидатов
обработан 941 с POS NOUN/VERB/ADJ/ADV; 64 PROPN исключены. Дополнительно обработаны
12 ранее предложенных выражений, всего 953 candidate decisions. Это не все
словоупотребления: в запрос переданы первые три разных предложения кандидата.

Обычный код строит shortlist из ранее полученных запросов леммы/форм. Первая
SDK-роль выбирает конкретные существующие значения. Вторая SDK-роль получает
контекст и выбранную статью без объяснения первой, может принять, отклонить или
оставить сомнение. Обе роли используют тот же `gpt-6-luna`; это раздельные запросы,
а не независимые модели или подтверждение лингвистической точности.

| Источник | Кандидаты с 4 выражениями | Выбрано target pairs | Принято | Отклонено | Сомнение | HTTP calls |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| NOS | 258 | 237 | 207 | 26 | 4 | 24 |
| Easy Dutch | 385 | 320 | 295 | 21 | 4 | 35 |
| LUBACH | 310 | 258 | 239 | 11 | 8 | 28 |

Target pairs — candidate/entry, поэтому число до дедупликации отличается от
членства коллекции. Два механически неприемлемых выбора сохранены в evidence
и оставлены нерешёнными: NOS предложил пять targets при лимите три; LUBACH
предложил ID вне своего shortlist. Первоначальный combined validation error
имел общее имя `entry_outside_shortlist`; классификация выше уточнена по payload.
После ошибки NOS/LUBACH продолжены с frozen checkpoints, без повторных paid calls
для завершённых batches. Это не три непрерывных безошибочных запуска.

## Что проверяющий действительно дал

Проверяющий отклонил буквальное `komen1` («достичь места») для `Dat komt door…`.
Однако он также отклонил подходящие `bekend1`, existential `zijn1` и `willen1`;
эти три записи восстановлены оператором после сравнения полных конкретных
определений и исходных предложений. Из принятых обеими ролями оператор убрал
`goed3` (пригодность вместо наречного качества выполнения), literal `vel1`
в идиоматическом употреблении и неустановленный generic `man3`.

Следовательно, 58 отказов и 16 сомнений — сигналы для проверки, а не 74 доказанные
ошибки и не оценка accuracy. Выборочная операторская проверка не является gold
для всех 718 итоговых memberships. Наивный veto может ухудшить полноту;
следующий этап должен сопоставлять альтернативные значения и маршрутизировать
разногласия, а не автоматически считать проверяющего правым.

Идентичность в проверках сохраняется по entry UUID/alias, а не по паре
headword + ordinal: у разных lexical owners они могут совпадать. POS spaCy —
подсказка, не hard gate: `fragmenten`, `biografieën`, `geheugen` и другие
встречаются с ошибочными parser POS; фильтр по нему потерял бы правильные записи.

## Дополнительный поиск выражений

Три отдельных запроса предложили 27 выражений; 25 имеют точный source anchor,
два Easy Dutch отклонены как не привязанные к исходному предложению. Эти
25 — предложения, не 25 доказанных пропусков. Часть уже покрыта коллекцией
(`opkomen voor`, `opzoeken`); часть сочетаний композиционна.

Обычный код выполнил 46 principal-scoped dictionary queries по canonical/surface
формам. Пять запросов вернули статьи. Lookup имеет собственные tier/pagination
границы; пустой ответ не означает отсутствие во всех доступных словарях.

Практическое дополнение после операторской проверки exact context + definition:

- Easy Dutch: добавлен `meevallen1` для `Dat valt wel mee`; удалён широкий
  `vallen3`, который ранее приняли обе роли. Добавлен `afhangen van1`
  для `Dat hangt van de situatie af`.
- LUBACH: добавлен `houden van1` для `Ik ben steeds meer van geschiedenis gaan
  houden`; значение 2 о вкусе еды не добавлено.

Это отдельная операция по уже созданным list IDs. Первоначальный importer
помечен superseded, чтобы повтор initial manifest не вернул удалённый target.
Новые collection IDs из-за изменения manifest не создавались.

## Черновики статей

Один дополнительный SDK-запрос проверил десять ранее generated drafts:
восемь признаны моделью допустимыми черновиками, два требуют нормализации:
`er dan ook iets achter zoeken` → `er iets achter zoeken`,
`buiten m'n comfort zone` → предложено `buiten de comfortzone zijn`.
Рекомендации — отдельный review output; исходные drafts не переписаны и не
сохранены в пользовательский словарь. Замечание модели о грамматике определения
comfortzone не считаем доказанным: в исходном определении есть предлог `In`,
который критика опустила. Канонический заголовок требует отдельного решения.

## Время и стоимость

Azure resource `dilumio-01-resource`, Sweden Central, Microsoft Azure Sponsorship;
endpoint `/openai/v1/responses`, deployment `gpt-6-luna`, low reasoning.
Новые запросы: 2026-10-18 21:02:22.866–21:06:09.056 UTC
(23:02–23:06 Europe/Amsterdam). Источники выполнялись параллельно; это не
сумма latency запросов и не полное время operator review/DB операций.

88 HTTP calls: 87 на selection/verification/gap discovery и один на draft review.
Все 88 ответов HTTP 200, usage известен. Input 387288 tokens, output 82687;
cache read 0, cache write 386340, ordinary input 948. Estimated published model
cost **$0.0897308**; накопленно по пилоту 154 calls, **$0.126051325**.
Это list-price estimate, не сверенный invoice Sponsorship. ASR CPU, storage и
lookup infrastructure не монетизированы. Ставки и machine-readable evidence:
[JSON](QUALITY-RESULT-20261018.json),
[источник опубликованных ставок](https://azure.microsoft.com/en-us/blog/gpt-6-astra-sol-and-luna-for-production-agents-in-microsoft-foundry/).

Границы каждого source-прохода: ≤48 HTTP calls, ≤768 KiB запросов суммарно,
≤96 KiB/request, ≤4096 output tokens/call, 600 секунд процесса; три известных
source-фазы. Draft review отдельно ограничен одним запросом. Transport retries
и SDK trace export отключены, `store=False`. Данные и ответы сохранены в
ignored `tmp/agent-import-742/multivideo-20261018`, checkout #742 сохраняется.

## Проверка кода и следующий шаг

30 focused tests прошли. Добавлены проверки scope entry IDs, полноты ответов
проверяющего и regression для cost groups: одинаковое имя `model-phase` у разных
видео больше не перезаписывает breakdown; aggregate total ранее был корректным.

Следующий инкремент: формировать routing queue по причинам, сравнивать rejected
sense с альтернативами, до генерации расширять dictionary scope; оценивать на
отдельно размеченной выборке precision/recall и ложные veto. Требуется сохранять
контекст и UUID identity, а не соединять статьи по одинаковым headword/ordinal.
App integration, private draft save и автоматический repair всех пропусков
по-прежнему не реализованы.
