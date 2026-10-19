# Предложенный первый AI-инкремент в приложении

2026-10-19. #742/#685, будущие engineering slices #743–#747; folders/metadata/sharing #684. **План для обсуждения и реализации, runtime не внедрён.** [Требования владельца](../../discussions/2026-10-19-06-ai-workspace-and-context-dialog.md), [аудит существующих контрактов](AI-ENTRYPOINT-READINESS-20261019.md).

Качество Luna достаточно для ограниченного owner pilot. Не требуется сначала получить100%слов или выбрать жёсткий маленький turn limit. Главная незрелая часть — production execution/authorization/recovery, а не ещё одна языковая модель. Исследовательские20turns и measured usage — отправная точка измерений, не универсальная production quota.

## Сценарий первого релиза под feature flag

1. Пользователь открывает AI surface (название/место в навигации пока не утверждены) и вставляет YouTube URL. Сервер нормализует ID, проверяет video/title/channel, доступные дорожки и язык; не начинает дорогую транскрипцию на одно распознавание ссылки.
2. Диалог показывает source preview, author captions либо ASR fallback, название будущей коллекции и назначение. Активные язык/словарь — default, неоднозначность запрашивается явно. Если destination однозначен, лишнего вопроса нет; пользователь может изменить имя/папку.
3. Пользователь подтверждает конкретный plan/source snapshot. Сервер создаёт persistent run и отвечает job ID; браузер показывает progress и может закрыться. Обновление вкладки восстанавливает сообщения/статус, а не запускает повторную работу.
4. Код получает текст через AudioFilms, сохраняет artifact/occurrences, выполняет детерминированную подготовку и batch lookup. Luna high извлекает/уточняет, располагает source/dictionary read tools. Неоднозначное отправляется в persisted question queue, остальное продолжает обрабатываться в согласованной области.
5. Существующие значения и одобренные личные статьи добавляются через текущие authoritative actions. План фиксирует, разрешена ли personal generation; внутри разрешённой области не нужно повторять согласие на каждое слово. Нерешённое остаётся явным списком. Ошибка одного item не теряет уже сохранённые результаты и не дублирует их при resume.
6. Диалог даёт итог: existing/personal/uncertain counts, коллекция, source/channel и список ограничений. Отдельное «Тренировать» запускает обучение; создание коллекции не меняет FSRS.

Не нужна имитация болтовни на каждом этапе: короткий ответ агента сочетается с обычными preview/progress/question/result компонентами. Источник фактического статуса — durable run, не текст «готово», сгенерированный моделью.

## Глубокие модули вместо логики внутри chat route

- **Conversation service:** owner-scoped session/messages/context snapshots; связывает сообщения с run/question/confirmation. Один сервис для отдельного AI surface и contextual dialog.
- **Import coordinator:** source artifact, confirmed plan revision/hash, leased background steps, checkpoints, per-item receipts/idempotency, waiting_user, cancel/resume и накопленный бюджет. Прямые SDK loop/SQL/SSH скрипты не становятся browser API.
- **Capability/tool adapter:** server-owned principal, allowlisted domain actions, current access checks на каждом вызове. UI/card/import surface получает свой набор инструментов; модель не выбирает user ID, RPC, SQL или произвольный URL.
- **Source adapters:** сначала AudioFilms YouTube; затем pasted text, web text и file extraction с единым normalized text/provenance output. SSRF, redirects, MIME/size limits и retention принадлежат серверному adapter, не промпту.
- **Learning/collection write boundary:** текущие entry/list actions; generation/proposal отдельно от save. Свой прогресс пользователя не смешивается с общим материалом и chat state.

Ожидаемый минимум persisted states:queued/running/waiting_user/committing/partially_succeeded/succeeded/failed/cancelled. Конкретные таблицы/API и enum ещё не приняты; не создавать их из этого документа автоматически. SSE/polling — транспорт UI, а не замена durable state.

## Источник, папка и фильтры

Import передаёт `source kind/provider ID/canonical URL`, video ID/title, channel ID/display name, transcript language/kind/revision и requested destination. Это предложенные поля контракта. Channel ID/Video ID — идентичность; title/name — отображаемые snapshots. Папка не заменяет source filter: YouTube можно фильтровать и вне папки YouTube.

#684 владеет folder placement/tags/sharing. Не вводить здесь второе дерево папок. Для pilot без готовых folders — flat collection; источник/канал в названии и описании, без ложного обещания структурных фильтров. #684 уже приняла live saved updates без обязательного Publish. Частичный сохранённый состав можно показывать с import status; внутренний generated proposal не является новой пользовательской публикационной стадией.

## Контекстный диалог по словарю — следующий самостоятельный slice

Кнопка AI на конкретном значении открывает диалог того же сервиса с entry UUID, выбранным значением, видимыми определением/примерами, соседними сравниваемыми значениями, языком и при необходимости исходным предложением. На вопрос «чем1отличаетсяот2» агент читает оба выбранных entry, а не угадывает их по ordinal.

Личная заметка сохраняется только по запросу пользователя и в его область. `user_word_notes` есть per-entry; API/rendering/conflict handling пока нет. Не записывать её в raw.notes общей статьи или в авторский notes другого владельца. Если пользователь сказал «сохрани это», выбранная запись однозначна и область уже согласована, лишний modal не требуется; при двусмысленности агент спрашивает, к какому значению. Нужен будущий выбор: заметка на значение или отдельный card type; default по существующей модели — на значение, но это ещё не окончательное UX-решение.

## Критерии проверяемого первого инкремента

- Один реальный YouTube import из UI до owner collection; duplicate submit/reload/reconnect не создают дубликаты и не теряют вопрос.
- Owner/other-user isolation для conversation, artifacts, drafts, notes и tools; credentials не в клиенте. Confirmation относится к конкретному plan revision/source/destination, а не словам модели.
- Kill/restart worker и expired lease не создают вторую коллекцию/статью; partial result и budget восстанавливаются. Cancel прекращает будущие шаги; undo касается только созданного данным run, не прежних пользовательских memberships.
- Existing meaning selection и generated personal save проверены отдельно; ссылки только на разрешённые существующие IDs. Нерешённое не маскируется под отсутствующее во всех словарях.
- Source metadata contract согласован с #684/#747; фактические filters/folder support отличаются от ещё проектируемых. Generated content явно помечено и доступно владельцу для редактирования.
- Коллекция/статья не запускает learning; FSRS/history неизменны. Статистика usage включает ошибки, повторы и неизвестный usage, а не только удачные ответы.

Предлагаемый порядок: persistent run + source preview/confirmation и private collection save → AI conversation UI поверх этого → personal generation/save в разрешённом плане → contextual explanation/notes → дополнительные source adapters. Качество модели позволяет начинать этот путь сейчас; готового production chatbot пока нет.
