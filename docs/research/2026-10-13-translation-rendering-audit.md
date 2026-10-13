# Аудит Translation: полнота, актуальность и согласованность отображения

2026-10-13. Статус: диагностика завершена, исправления runtime не внедрены.
Владелец: текущая сессия Codex. Задачи: [#674](https://github.com/vbalashi/2000nl/issues/674)
и [#655](https://github.com/vbalashi/2000nl/issues/655).
[Требование владельца](../discussions/2026-10-13-01-translation-completeness.md).
База исследования: `ffa3c0b35da1707bcb9d4d76c5fad9193207ff47`;
ветка `codex/674-translation-audit`, checkout `.worktrees/674-translation-audit`.

## Установлено

1. **Дефект согласованности снимков.** Подготовка word-context Translation
   обновляет перевод слова/выбранного примера, но не обновляет снимок статьи,
   которым пользуется оборот. Воспроизведение показывает ровно описанный симптом.
2. **Дефект входа в восстановление.** Актуальный `ready`-заголовок может скрыть
   неполноту остальных полей: lookup не проверяет coverage и не выдаёт capability
   для восстановления. Некоторые клиенты также останавливаются при наличии
   любого перевода. Очередь проверяет полноту, только если вызов дошёл до неё.
3. **Отдельный вопрос качества `paal`.** Сохранённый актуальный ответ действительно
   содержит «кол» и пустые альтернативы. UI не потерял «свая» из этого ответа.

Первый дефект объясняет расхождение скриншотов; второй воспроизведён как
самостоятельная проблема, но не наблюдается в пяти текущих полных кешах.
Исторический HAR с телефона отсутствует: точную очередность запросов той
сессии восстановить нельзя. Воспроизведение доказывает дефект кода, а не
претендует на восстановление каждого исторического HTTP-ответа.

## Production evidence

Прочитаны только нужные словарные записи, переводы `ru` и связанные задания.
Cache, очередь и прогресс не изменялись. UI и worker используют один образ
`d253a8316f54cdbfeade900a959618a847859ccf`; jobs включены; профиль `luna6`
означает Luna v8/high. Более новые именованные экспериментальные промпты
не являются автоматически активным production-профилем.

Для каждой из пяти записей локально повторены реальные функции identity,
coverage и V2 projection на прочитанном артефакте. Совпали source revision,
policy, provider revision и полный request fingerprint. Все существующие
content nodes получили `ready`; все запрошенные поля имеют непустые значения.
Fingerprint промпта: `129be0a92c4890f99ea96b8c5c48335d9e39fafa130597d0b96c2f92d0ef2035`.

| Запись | Поля запроса, без заголовка | Готово, Europe/Amsterdam | Существенное наблюдение |
| --- | ---: | --- | --- |
| heersen, a975eb2a… | 3/3 | 13 октября 03:06:34 | Есть определение, Usage и альтернатива «властвовать», отсутствующие на скриншоте |
| lichaam, 00591edf… | 4/4 | 03:06:31 | Есть определение, пример, синоним и антоним |
| gestalte, 47773c6d… | 6/6 | 03:07:40 | Есть определение, синоним и вложенная идиома с переводами |
| geduld, 44d92b6c… | 2/2 | 03:23:28 | Полный перевод готов до скриншотов в 03:24 |
| paal, a4fb3c19… | 8/8 | 03:27:15 | primary «кол», alternatives [], base «столб», пример «дом построен на сваях» |

В каждой строке job завершён с первой попытки. У двух слов также сохранились
старые переводы другого provider; активный V2 путь фильтрует provider и не
использовал их в replay.

## Где происходит проверка и запуск

| Этап | Код | Фактическое поведение |
| --- | --- | --- |
| Lookup | `lib/platform/platformV2LookupService.ts`, `platformV2TranslationService.ts` | Read-only. Сравнивает source revision и policy, включающую модель, настройки и тексты промптов. Сам не ставит задания |
| Предзагрузка будущих членов | `components/training/v2/useLatchedTranslationBuffer.ts` | Запрашивает подготовку напрямую для не более трёх frozen future entries; поэтому эта ветка достигает проверки полноты даже при `ready`-заголовке |
| Подготовка обычной карточки | `lib/platform/platformV2TrainingPreparationClient.ts` | Считает `entry.translation.status === ready` попаданием в кеш; полноту остальных полей не проверяет |
| Подготовка лицевой стороны Translation | `lib/training/wordContextPrompt.ts`, `sentenceExerciseLoader.ts` | Загружает отдельную статью; при готовом выбранном примере может вернуть ready без запуска проверки всей статьи |
| Оборот | `components/training/v2/TrainingSenseCardV2Session.tsx`, `TrainingSenseCardStage.tsx` | Читает свой ранний lookup. Подставляет из context prompt лишь слово и выбранный пример; определения, Usage, альтернативы и relations остаются из раннего снимка |
| Полный просмотр | `components/training/library-v2/LibrarySenseCardV2Session.tsx` | Может сделать новый lookup и увидеть готовый перевод. При compatibleInitialGroup может вообще пропустить новый lookup; сам факт открытия не гарантирует свежую серверную проверку |
| Кнопка перевода | `TrainingSenseCardStage.tsx`, `library-v2/LibrarySenseCardGroup.tsx` | Наличие любого display/cached translation может превратить кнопку только в переключатель видимости, не в подготовку недостающих полей |
| HTTP preparation | `app/api/platform/translation/route.ts` | Проверяет auth, scope и доступ к записи; вызывает server preparation facade, foreground priority 10 / background 0 |
| Cache/queue facade | `lib/translation/dictionaryMeaningTranslationRequestService.ts` | Проверяет полный fingerprint, source/policy identity и реальные значения всех полей запроса. Неполный matching ready-кеш не считается hit; задание ставится/наблюдается через существующие RPC |
| Worker | `dictionaryTranslationJobExecutor.ts`, `dictionaryTranslationJobWorker.ts` | Перечитывает trusted source, сверяет identity до и после модели, проверяет coverage перед fenced atomic publication |
| Response contract | `dictionaryMeaningTranslationContract.ts` | Требует по одному непустому результату для каждого запрошенного fieldId. Пустой alternativeTexts разрешён; лингвистическую необходимость альтернатив эта проверка установить не может |

Все пути таблицы относятся к `apps/ui/`, кроме SQL публикации в migration 223.
Утверждение документации «обновится при следующем просмотре карточки» сильнее
фактической реализации: нужен новый lookup и достижение preparation action.
Существующий React-снимок и compatibleInitialGroup этого не гарантируют.

## Воспроизводимые дефекты

Синтетические регрессии добавлены в существующие suite:

- `TrainingSenseCardV2Session.test.tsx`: ранний lookup без переводов → context
  preparation получает готовые слово/пример → оборот показывает пример, но
  не определение, хотя следующий доступный lookup уже полный.
- `platformSenseCardV2Projection.test.ts`: ready/fresh заголовок и непереведённый
  definition → ожидаемая request-translation capability отсутствует.

Обе проверки запущены обычными `test` и упали. В сохранённом audit checkpoint
используется `test.fails`: это явно ожидаемые, **не исправленные** дефекты.
После исправления соответствующую отметку нужно снять; успешное выполнение
самого assertion при `test.fails` также будет ошибкой, так что дефект не
превратится в молча забытый skip.

Проверка checkpoint: восемь относящихся к цепочке suite — 123 проверки
(121 обычная и две expected failures), typecheck PASS, lint PASS с существующим
предупреждением о зависимости handlePlayAudio в TrainingSenseCardV2Session.
Без expected-failure отметок две новые регрессии воспроизводимо падают.

Команда узкого replay (обычные `test`, до отметки ожидаемого падения):

```sh
cd apps/ui
npx vitest run tests/TrainingSenseCardV2Session.test.tsx tests/platformSenseCardV2Projection.test.ts -t 'refreshes answer translations when context preparation|offers translation repair'
```

Результат: `2 failed`, около 2.4 s. Первое падение — отсутствующий перевод
определения, второе — отсутствующая capability. Прочитанные production-артефакты
отдельно прошли replay identity/coverage/projection для всех пяти записей.

## Проверка уточнения промпта

Текущий промпт уже требует учитывать все поля, но одновременно исключает
более узкие категории и предлагает не переключать подзначение широкой
дефиниции. Пустые альтернативы специально разрешены. Это может противоречить
полезному контекстному эквиваленту, который прямо требуется обычным примером.
Это гипотеза о выборе модели, а не доступ к её внутреннему рассуждению.

Кандидат заменяет запрет любых broader/narrower categories на запрет
**unsupported** categories и разрешает примером подтверждённый вариант.
Ключевое уточнение:

> Use standalone examples as evidence for primaryText and alternativeTexts,
> not only for translating their own fields. When a broad source definition
> and an ordinary standalone example require different conventional
> target-language equivalents for this supplied meaning, choose a natural
> general equivalent as primary and retain useful example-supported
> equivalents as alternatives. A context-specific equivalent directly
> demonstrated by a standalone example is allowed even when it is narrower
> than the general definition; do not omit it merely for that reason.
> Do not add unrelated dictionary senses, arbitrary subtypes, or meanings
> inferred only from idiom expressions. Idioms constrain their own
> translations and do not broaden the ordinary headword alternatives.

Оставлено требование не заполнять альтернативы ради количества. Проверка:
тот же production OpenAITranslator и Luna6/high, одинаковый JSON-контракт,
перехват только текста system prompt у кандидата; без записи результатов в DB.

| Случай | Текущая формулировка, новый вызов | Кандидат |
| --- | --- | --- |
| paal с примером строительства | столб, [] | столб, [свая] |
| bank, финансовая дефиниция | банк, [] | банк, [] |
| eend, короткая дефиниция категории | утка, [] | утка, [] |

Шесть ответов прошли реальный parser: 8/8 полей у paal, 2/2 у контрольных
карточек. Повторный baseline отличается от сохранённого «кол»: свежесть
артефакта не гарантирует детерминизм или качество каждого ответа модели.
Выборка мала, только ru; оценка неблайндовая агентская, без человеческого
утверждения. Кандидат не внесён в активный промпт и не выпущен.

## Предлагаемый порядок исправления

1. Согласовать готовность context prompt и оборота. Безопасный минимальный
   вариант — перечитать authoritative training lookup после готовности context
   translation, сохранив направление, frozen example и защиту от поздних ответов.
   Не копировать целиком Library card state в reverse-card: Library lookup
   использует word-to-definition, а Translation — definition-to-word.
2. Вычислять coverage в read-only server projection и использовать результат
   для repair eligibility. Все клиенты подготовки должны учитывать capability /
   требуемые поля, а не только заголовок или любое переведённое поле. Enqueue
   и provider execution остаются в существующей preparation/worker цепочке.
   Различать usable partial display и completed preparation, не изобретать
   повторную очередь или принудительную массовую регенерацию.
3. Расширить качество-прогон кандидата промпта: общая дефиниция + специальный
   пример, несовпадающие смыслы, идиомы, несколько языков и повторы. После
   принятия смена активного prompt fingerprint штатно инвалидирует старые
   артефакты при достижении preparation action.
4. Отдельно продолжить ранее отложенную whole-source completeness для больших
   статей: request builder ограничивает количество/объём полей, поэтому
   requestComplete не доказывает перевод всех полей исходной статьи. У этих
   пяти небольших карточек поля не отброшены; это не причина скриншотов.

## Сохранение evidence и границы checkpoint

Production readback, диагностические логи, временный replay и evaluator
сохранены локально в
`/Users/khrustal/adhoc/2000nl-research-archives/674-translation-audit-2026-10-13/`.
Они не включаются в release PR: там есть исходные словарные материалы.
Секреты не читались в вывод, не копировались из окружения контейнера и не
сохранялись. Production затронут только чтением словарных данных и шестью
изолированными модельными вызовами; provider-вызовы не писали переводной кеш.

Checkout оставлен для review аудита и следующего исправления двух открытых
регрессий; не является готовым release PR. Reference main не изменялся.
Изменения checkpoint: документация и диагностические тесты, без runtime fix.
