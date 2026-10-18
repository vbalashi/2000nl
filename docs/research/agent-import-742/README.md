# Встроенное добавление учебных материалов — discovery #742

Дата: 2026-10-18. Владелец: #742, родитель [#685](https://github.com/vbalashi/2000nl/issues/685).
Статус: **предложенный дизайн**, не принятое расширение контрактов и не реализация.
Аудит кода: reference `e068e559e71d`; production и актуальный состав словарей не проверялись.
Live этапы/зависимости — GitHub Project2, не этот документ.

**Уточнение после первоначального discovery:** [обсуждение значений и масштаба](../../discussions/2026-10-18-02-agent-import-resolution-and-scale.md)
заменяет ниже прежние предложения «без контекста всегда unresolved», полного
игнорирования английского и обязательного reviewed pipeline для каждой private
статьи. Default — первое значение, перевод допустим для resolution; лёгкий personal
draft предложен как отдельный маршрут. YouTube приоритетен, server batching и
стоимость требуют измерения. Историческое предложение полного quality path ниже
сохранено как опция повышенной проверки, не обязательный personal MVP.

## Первый выполненный pilot

[Результат на авторских субтитрах видео владельца](pilot/RESULT-20261018.md):
7:49, 141 cue, 298 candidates, 246 existing exact memberships в новой коллекции.
Владелец отдельно разрешил эту запись в своём аккаунте; прежний discovery-only запрет
на user mutations для данного конкретного результата заменён этим поручением.
Обучение/production runtime/DB schema не менялись. Private generation и автоматический
LLM resolver ещё не реализованы; actual measurements и ограничения в отчёте.

## Внешний пилот до интеграции

[Поэтапный план на видео владельца](pilot/PLAN.md) и [варианты NLP](nlp-options.md).
Уточнение: Known сохраняются в collection; прежнее предложение фильтровать их при
сборке отменено. Extraction JSON отдельно от lookup/resolution; mixed-list input
может быть на разных языках. Подробности в [новой дискуссии](../../discussions/2026-10-18-03-external-youtube-pilot.md).

## Исходный сценарий владельца

В приложении нажать «Добавить слова списком», вставить двуязычный учебный список,
оставить нидерландскую часть, найти нужные значения, создать/дополнить коллекцию и
тренировать её. Мотив — учебный список для ребёнка. Работа идёт от текущей
авторизованной сессии; чужой email не разрешает запись. Делегирование/sharing — #684.
Владелец хочет встроенный диалог и узкие tool calls, а не новый скрипт под каждое слово.
Позднее: отсутствующие личные статьи, YouTube, web/PDF и тренировка двух коллекций.

Сохранённые сложные строки: `de jeugd / de jongeren`, `uiterst / uitermate`,
`zien als` / `gezien als`, `tekenen van`, `gelden voor`, `vertrouwen op`.
В `steeds maar weer over and over again` Dutch span — `steeds maar weer`,
а исторический `steeds maar weer over` — ошибочная сегментация. Нужна редактируемая
граница языка, а не доверие старому списку. Полный исходный список не входит в
handoff; его не восстанавливаем догадками. Исторические «отсутствующие» не означают
отсутствие сегодня. Research pilot 13+reuse3 — не запись и не публикация.

Основание: [#742](https://github.com/vbalashi/2000nl/issues/742), безопасная передача
`/tmp/2000nl-agent-import-discovery-20261018/HANDOFF.md`; персональные IDs не сохраняются.

## Evidence и проверка регламента

[Снимок 2.2](reference/CARD-GENERATION-RUNBOOK-v2.2-20261018.md), SHA256
`a2c65e6f02566406a9541c12958d9bb54a0779c740810e07f83606bc83093da1`.
18 октября вычисленный хеш совпал с [исходным pin](reference/original-pin.json).
Это документальный snapshot, не production dependency. Относительные ссылки внутри
снимка относятся к исходному research-каталогу, перечисленному в pin; зависимости
не скопированы и переносимость исполняемого pipeline этим не заявляется.
Изменяемый `CARD-GENERATION-RUNBOOK.md` не заменяет этот pin.

Прочитаны также `EDITORIAL-EVIDENCE-DECISIONS.md`, разделы core/editorial/recovery
регламента. Их происхождение — тот же evidence-owning checkout603. Он, текущие
партии3×300 и старый Azure run не изменялись. Ни paid вызовов, ни DB/production
мутаций в discovery нет. Дополнительные факты по исходному коду и тестам —
[карта аудита](../agent-import-742-code-audit.md).

## Первый достаточный инкремент

**Текст → проверяемый план точного поиска → одна manual collection → существующая тренировка.**
Сервисы остаются в `apps/ui/lib/platform`, клиент — тонкий UX; durable receipts и
правила авторизации принадлежат DB/RPC. `apps/api` не становится новым runtime.
В первой поставке нет генерации отсутствующих, общего NLP всех документов или
свободного агентного цикла. Это небольшой полезный путь, пригодный затем для tools.

1. Пользователь вставляет список, выбирает новую/свою существующую manual collection.
   Видит область: «Добавить найденные выбранные значения; пропустить отсутствующие».
2. Preview сохраняет private source artifact, хеш и mapping строк/offsets. Показывает
   исходную форму, извлечённый Dutch span и отброшенный перевод. Пользователь может
   исправить выделение и разделение `/`; lemma — предложение, не замена оригинала.
3. Точный lookup в явно выбранном доступном scope, включая собственные private
   dictionaries. Результат содержит entry/dictionary IDs и точный смысл/контентный
   binding, если нужен. Нельзя выбирать первый результат по популярности.
   Однозначные точные совпадения выбираются автоматически; несколько значений,
   формы/синонимы и сомнительные границы образуют компактную очередь выбора.
4. Один Apply подтверждает весь plan revision, а не каждое слово. Ambiguous/missing
   можно оставить нерешёнными и применить разрешённое подмножество. При другом
   запросе пользователя scope подтверждения может быть шире, но сервер фиксирует его.
5. Receipt показывает added/already-member/ambiguous/not-found/failed/inaccessible,
   отдельно missing и embedded-only; числа — entries, не число упражнений.
   Кнопка «Тренировать коллекцию» открывает обычный Setup с collection ID;
   enrollment, Known и grades сами не выполняются.

Слово/фраза внутри примера — evidence hit с целевым span, а не самостоятельная
trainable entry. Поиск примеров можно показывать как подсказку, не добавлять
родительскую статью вместо выражения. Нет уверенного смысла — unresolved.
`de jeugd / de jongeren` и `uiterst / uitermate` не сливаются в один entry:
написание, грамматическая форма, синонимия и смысловая identity — разные отношения.

## Предлагаемый серверный контракт

Это интерфейсы доменных операций, **не существующие endpoints**. HTTP/UI/tools
используют одни сервисы. JSON схемы закрытые; principal, scope/capabilities,
user ownership вычисляются сервером. Модели не передаются SQL, service-role key,
произвольный URL fetch либо пользовательский UUID как authority.

| Операция | Вход | Выход / инвариант |
| --- | --- | --- |
| `collections.list/read` | bounded cursor / collection ID | только доступные collections, writable capability и revision |
| `imports.preview` | text, language policy, dictionary scope, target, request key | private job/plan ID, revision, candidates и source mapping; ноль learning writes |
| `imports.resolve` | plan ID+revision, candidate IDs+выбор target/span/skip | новая immutable revision; только серверно проверенные IDs |
| `catalog.lookupExact` | candidate/span, language, bounded scope/cursor | paginated exact entries, sense/content targets, match relation; private filter до ответа |
| `catalog.searchEvidence` | bounded query/scope | отдельные article/form/example evidence, без фиктивного exact-match |
| `imports.apply` | plan ID+revision+hash, approval token, request key | per-item receipts; target и разрешённый набор берутся из плана |
| `imports.status/resume/cancel` | job ID, revision/operation key | authoritative state; отмена прекращает новые шаги, не отменяет подтверждённые записи |
| `imports.undo` | receipt ID+request key | компенсация только фактически добавленных этим import memberships |
| `generation.prepare/review/status` | unresolved candidate IDs, plan revision, approved budget | версия артефакта, ledger, review и unresolved; нет сохранения |
| `generation.saveAccepted` | accepted artifact+hash, request key | private durable entry ID; затем отдельный idempotent add-to-collection |

Create/rename collection и add/remove entry — allowlisted tools над существующими
доменными actions. Первый Apply создаёт новую collection не более одного раза.
Delete collection — отдельное явно разрешённое действие с dependency checks,
не универсальный undo. Для connected clients сохраняются platform:read/write;
в приложении — session auth/CSRF и server-side capabilities без обхода Platform.
Для всех protected reads и commit повторная проверка прав; revoked scope не
возвращает названия/содержимое чужого private словаря. Модельный текст и source text
не могут расширить утверждённые операции, бюджет или destination.

Семантическая дедупликация: один точный target ID в collection один раз, без
схлопывания одноимённых разных смыслов/словарей. Сохранение Generated entry
не является override curated entry (#87) и не означает start-learning (#50).
Не превращать произвольные local runbook sense IDs в production IDs.

## Durable plan и ограничения фоновой работы

Предлагаемые состояния: `prepared → needs_resolution → ready → applying →
completed | partial | cancelled | failed`; ожидание редактора/бюджета отдельными
причинами. У candidate отдельные этапы и terminal outcome. `partial` пригоден к
resume только для неуспешных шагов; resolved изменения образуют новую revision.
Результат не объявляет completed-success при unresolved/failed: показывает каждый исход.

- Private job принадлежит пользователю; immutable input hash, extraction version,
  выбранный scope, source mapping, target revision и разрешение сохраняются до Apply.
- `(user, requestKey)` связывается с canonical payload hash. Тот же key+payload
  возвращает старый receipt; иной payload — conflict. Новое намеренное добавление
  получает новый key. Observation/time/retry diagnostics не меняют semantic key.
- Каждый item имеет стабильный operation ID для existing action clientEventId.
  Receipt и эффект фиксируются атомарно за DB boundary; crash после commit
  восстанавливается по receipt. Не заявляем atomic весь импорт. Save succeeded,
  membership failed — хранить entry ID и повторять только membership.
- Worker: durable claim/lease, fencing generation, heartbeat, bounded chunks;
  старый worker после lease loss не может commit. Не `fire-and-forget` после HTTP.
  Транспортные in-flight попытки сначала reconcile, затем retry; timeout не доказывает
  неисполнение. Browser refresh/закрытие не теряет plan и результаты.
- Предложенные стартовые технические пределы для text MVP: 20 KiB UTF-8, 100
  кандидатов, 1 active apply/user, chunks ≤10, work lease 30s с продлением и fencing,
  максимум 2 физических попытки/логический шаг. Это параметры для load/failure
  проверки, не принятые квоты. Завершение HTTP возвращает job ID; не держит весь job.
- Reviewed generation сначала ≤10 кандидатов/job, concurrency ≤2/user плюс общий
  операторский cap; максимум 2 core repair cycles, transport/format/validation
  retries — единый pool из 2, не три отдельных бюджета. Semantic repair требует
  явного versioned контракта, текущая v2 обвязка не делает его автоматически.
- Перед каждым provider call резервируется token/cost exposure и проверяются
  capability (#474), deadline, call cap и cancel. Usage unknown сохраняется и
  резервируется консервативно; не обнуляется при resume. Точные monetary/time caps
  должны быть заданы configuration до enable, иначе generation disabled.
  Исторические 10000 HTTP/$150/48h не наследуются.
- Cancel останавливает запуск новых задач; уже подтверждённые результаты остаются,
  поздние provider responses журналируются и не сохраняются автоматически.
- Undo удаляет только membership, отсутствовавшее до операции и всё ещё принадлежащее
  её insertion revision. Если кто-то успел удалить/добавить заново — conflict/skip.
  Предсуществующие memberships, generated entries, другие collections и progress
  не удаляются. Пустую созданную collection можно удалить отдельно после проверки
  изменений/dependencies. FSRS и action history не откатываются.

Source privacy: исходный список нужен для правки и resume, но это не бессрочный
публичный corpus. Предлагается encrypted/user-scoped raw input TTL 7 дней, bounded
snippets/offset hashes в receipt; удалить raw после TTL без удаления результата.
Это ещё решение продукта. Нельзя помещать полные private списки в observability,
модельные логи общего доступа или shared canonical sources. URL observations
очищаются; shared identity разрешена только для server-normalized public source.

## Замена ручной Root-приёмки

Runbook2.2 — исследовательская цепочка, не готовый продуктовый API. Существующий
`generatedEntryDraftService.ts` делает одиночную генерацию, требует `contextText`
и не обеспечивает независимую приёмку. Пустой контекст нельзя заменить выдуманным
предложением или проигнорированным английским переводом. Новый prepared input
различает `source_context` и `lexical_request_without_context`; второй маршрут
требует отдельного prompt/schema/evaluation, а не обхода текущего валидатора.

Предлагаемая общая граница `ReviewedPersonalGeneration`:

1. Identity/owner reconciliation в accessible catalog и своих private entries;
   prepare фиксирует candidate, sources/rights, scope, policies, schema/prompts,
   assembled messages, версии retrieval и бюджет. Registry research и product
   draft registry различаются; reused research artifacts не импортируются автоматически.
2. Generate → independent core critic с семью проверками → до двух repair cycles.
   Сохраняются полная статья, история, обязательные issues и explicit closure.
   Пропавший issue не закрыт; новый текст инвалидирует старый verdict.
3. Вместо нынешнего читателя Root — выделенный server acceptance executor с
   versioned policy и отдельным review request. Он читает весь exact artifact,
   sources, ledger/lineage, before/diff и независимую критику; формирует rationale,
   obligations и signed server receipt, привязанный к input/article/review hashes.
   Детерминированный verifier проверяет поля/closure/authority, но не объявляется
   доказательством истинности определения. Модель не выдаёт сама себе receipt.
4. Semantic proposer → отдельный critic нового предложения → acceptance executor
   для final version. Допустимы merge внутри unit, metadata существующих expressions,
   display links; не новые смыслы/примеры/грамматика под видом grouping.
5. Required defects, ownership conflict, insufficient evidence, unsupported names,
   uncertain expression boundary → `needs_editor`/unresolved; нет автосохранения.
   Пользователь выбирает принять пригодные **личные** карточки одним действием;
   этот save-consent не выдаётся за экспертную лингвистическую приёмку.
6. Только accepted artifact идёт в product projection validator → private save →
   membership. Research `research_only=true/import_ready=false` не снимается
   «зелёной» критикой. Shared dictionary publication — отдельный редакционный путь.

Автоматический acceptance executor — **гипотеза дизайна**, не установленная замена
эксперта. До enable: pinned fixtures и независимая ручная оценка word/form/name/
polysemy/expression/contextless случаев; отдельная held-out выборка, критерий
false acceptance required defect = 0 в проверочном наборе; публиковать знаменатели,
unknown и цену всей цепочки. Если барьер не пройден — human editor gate, а не
тихое снижение требований. Выбор модели/провайдера в discovery не фиксируется.

Expressions: пригодна структура runbook `candidate → unit(kind=expression) →
senses → examples`, pattern/components и явная owner/navigation relation.
`display_parents` — представление, не перенос смысла и не учебная identity.
Проверять whole-span/context, literal/idiomatic readings, productive construction,
collocation и inflected form; не делать каждый n-gram идиомой. Существующие idiom
content-bound targets можно reuse, если подтверждён точный binding/eligibility.
Новые самостоятельные phrase cards и их переводы — #50, не word с пробелом.
Леммный пилот не валидирует качество выражений. Usage/grammar suggestions —
sidecar proposal/review/acceptance; `sense_gap` и `article_candidate` остаются
очередью до отдельного core route, не получают IDs автоматически.

## Chat, YouTube и документы

Chat (#685) после bounded text path: разговор формирует тот же preview/plan,
получает краткие tool results, предлагает resolution и вызывает разрешённый Apply.
Session/chat не хранит authority: сервер проверяет каждый tool. Ограничить tools/
turns/time/tokens, прерывать циклы без прогресса, редактировать историю, держать
cancel/status вне модельного контекста. Внешний текст — данные, не system instructions.
Ни provider-specific Agents SDK, ни universal code execution не требуются контрактом.

AudioFilms inspected paths (read-only): `app/src/lib/subtitleService.ts`,
`subtitleCache.ts`, `app/src/types/subtitles.ts`, `app/src/app/api/get-subs/route.ts`.
Существуют provider candidates/fallback, indefinite versioned file cache, actual
language, source/practice phrases, timing exactness/quality flags и retrieval metadata.
`GET /api/get-subs?videoId=&lang=&sourceKind=` — существующая поверхность, но
production S2S authorization и durable revision guarantee этой проверкой не доказаны.
File cache не является надёжным immutable provenance archive.

Предлагаемый adapter response: video ID, requested/actual language, track/source kind,
immutable text revision/hash, selected cues с text+start/end+span mapping,
timing evidence revision/confidence, provider warnings и retrieval receipt.
2000NL проверяет Dutch actual language, не извлекает слова из fallback demo и не
выдаёт approximate timestamps за exact. Requested `nl` не доказывает actual `nl`.
Сохраняет semantic source/artifact/location/selection отдельно от observation/
diagnostics, согласно runtime `sourceContext.ts`. Shared `PlatformSourceContextV2` пока
уже runtime: DTO описывает youtube/caption, а normalizer уже принимает также
web_page/text_document/ebook. Это обнаруженный contract drift, а не отсутствие
поддержки private sources вообще.
Договориться о trusted server adapter, revision/access/cache/cost/error контракте с
AudioFilms #22; не строить второй subtitle backend. Adapter не выставляет grades.

Web и PDF — разные последующие adapters в нормализованный private `SourceArtifact`
с content hash, language, extraction version, bounded text, page/paragraph/span map,
rights/visibility. Web требует server URL allowlist/SSRF и redirect/content-size
bounds; PDF — upload-size/page/text/OCR limits и отсутствие silent OCR cost.
Runtime V2 уже нормализует web/text/ebook, но shared DTO и adapter contracts
нужно согласовать с ним. `text_document` сейчас получает provider=pontix; внутренний
import не должен притворяться Pontix. Новые виды/producer требуют versioned
совместимого уточнения и characterization приватности/identity.
Заголовок и URL не дают public status; не помещать private documents в global dedup.

## Union двух коллекций — отдельное расширение

Уже возможно: одна manual collection со смешанными доступными entry IDs и training
по нескольким dictionaries. Это удовлетворяет первому списку. Не копировать статьи.
Настоящий новый контракт: `collectionUnion([A,B])`, resolve полных допустимых
revisions → recheck entry access → dedup exact IDs → existing exercise expansion.
Разные одноимённые entries не объединяются, один entry в обоих источниках даёт один
источник отбора, но существующие directions/FSRS остаются независимыми как сейчас.

Сохранить выбранные source IDs/revisions в preset/session. Membership snapshot при
старте; правки коллекций не расширяют активную очередь, live access/FSRS проверяются.
При недоступном источнике честное unavailable/partial notice, не fake empty и не
утечка private имён. Предлагается разрешать доступное подмножество после уведомления;
это требует отдельного одобрения расширенного контракта. Pending computation — не
access denial и не тихий drop. Preview count — unique entries vs eligible exercises.
Dictionary+collection union и multi-source rule collections не входят автоматически.

## Задачи, зависимости и оставшиеся решения

Переиспользовать #685 (assistant), #684 (sharing), #87 (overrides), #50 (phrase/
generated-card contract), #474 (generation capability/budget policy; зависит от
#470/#471), AudioFilms #22 (subtitle source/timing). #397 — закрытый corpus importer,
не пользовательский список; не переоткрывать. #7/#14 описывают существующий draft,
не новую reviewed generation. #409 — существующий dictionary/collection Setup.
После source audit созданы subissues в #742 и Project2 Workflow=Shaped:

| Slice | Зависимости |
| --- | --- |
| [#743: text → manual collection → Training](https://github.com/vbalashi/2000nl/issues/743) | review #742; первый рекомендуемый |
| [#744: одна reviewed personal preview](https://github.com/vbalashi/2000nl/issues/744) | #743, #50, capability #474/#470/#471 и quality gate |
| [#745: bounded chat/tools](https://github.com/vbalashi/2000nl/issues/745) | #743; #744 опциональная capability |
| [#746: union двух collections](https://github.com/vbalashi/2000nl/issues/746) | отдельный review source contract; не блокирует #743 |
| [#747: bounded YouTube excerpt adapter](https://github.com/vbalashi/2000nl/issues/747) | #743, AudioFilms #22, согласованный S2S artifact contract |

Web/PDF adapters пока остаются последующими этапами #742 до уточнения bounded
source contract; отдельные Ready implementation issues не создавались.
Новые slices связаны в owning #742 после source audit;
они остаются proposed/needs-design, не Ready и не разрешение на runtime работу.

Конкретные решения владельца (предложенный default):

- Разрешение Apply: один preview и подтверждение всего resolved subset, потом результат;
  без отдельного подтверждения каждого слова. Выбор спорных смыслов не автоматизировать.
- Хранение private raw input: TTL7 дней против «до удаления пользователем»;
  default TTL7 с сохранением bounded receipt.
- Приёмка generation: стартовать с editor-gated personal preview; автоматический
  executor включать только после отдельного quality gate. Нужен назначенный редактор,
  а не существование подписи `Root` в JSON.
- Union: отдельная поставка после text MVP; выбрать поведение частичной потери прав,
  предлагается разрешённое подмножество с явным уведомлением.

Это решения, которые меняют поведение. Сессия пользователя, игнорирование английского,
смешанная collection, отдельность sharing и запрет production mutations уже заданы;
повторно их не спрашиваем.

## Приёмка первого implementation slice

Fixtures: bilingual segmentation (включая `over`), aliases/inflections, одинаковое
написание с разными смыслами/словарями, private доступ, embedded-only phrase,
существующий/новый list, duplicate candidate/member. Replay same request, conflicting
payload, crash-after-commit, lease loss, cancel/late response, partial retry и undo
с concurrent re-add. Assertions: accurate receipt, ни одного implicit learning write,
нет private leakage, никакого расширения active Training scope. Нужны route/service
и локальные DB/RPC integration fixtures плюс один UI end-to-end text→collection→Setup;
смотреть #742 audit для актуальных owning modules. В этом docs-only исследовании
runtime тесты не запускались; выполняются hash, link/path и diff checks.
