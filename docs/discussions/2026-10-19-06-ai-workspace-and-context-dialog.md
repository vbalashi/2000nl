# AI в приложении: импорт материалов и контекстный диалог

2026-10-19, владелец в текущем Codex-чате. #742, связанные #743–#747; организация/обмен коллекциями — #684. [Проверка текущего кода](../research/agent-import-742/AI-ENTRYPOINT-READINESS-20261019.md).

## Поручение и требования владельца

1. Добавить два последних обработанных видео в две новые коллекции его ранее указанного аккаунта. Для полезного материала, которому не найдено подходящего готового значения, сгенерировать короткие личные статьи, сохранить в его словарь и включить в те же смешанные коллекции. Прямое разрешение касается этих двух источников; не менять прогресс обучения и не публиковать чужим пользователям.
2. В перспективе пользователь открывает AI-диалог, даёт YouTube URL, получает проверенные сведения о видео/субтитрах и предложение обработки, подтверждает запуск. Агент задаёт уточняющие вопросы при реальной неоднозначности. Файлы и ссылки на текст — последующие источники того же сценария.
3. Импорт должен учитывать source kind, video/channel identity/title и будущее назначение в folder/collection, чтобы работали фильтры. Владельцу важна гибкость; отдельный раздел с названием AI — рабочая идея, не окончательное UX-решение.
4. Контекстный вход из словаря/карточки: передать конкретные значения и вопрос, вести диалог, по просьбе пользователя сохранить личную заметку. Общее определение не изменяется из-за личного вопроса.

## Готовность

Качество Luna владелец признал достаточным для pilot. Ждать100%recall не требуется. Existing-first matching, controlled schemas и tool calling проверены внешне. Но внешние operator scripts с privileged SQL/SSH нельзя переносить в браузер. В runtime нет общей persistent AI conversation/run/question/confirmation модели; нужны server-side ownership, resumable jobs, capabilities и идемпотентное сохранение.

Ни новая страница UI, ни новая схема БД этим обсуждением автоматически не внедряются. Разрешены текущие account writes и планирование первого user-visible increment. Выбор SDK/provider не должен определять форму публичного domain API.

## Предлагаемая последовательность

Первый vertical slice: авторизованный пользователь создаёт conversation, вставляет YouTube URL, server preview отдаёт нормализованный video/source snapshot и доступные subtitle options. UI показывает destination/name и ожидаемый способ получения текста; после подтверждения запускает durable import job. Переподключение читает статус/вопросы/результат из БД. Для начала один source YouTube и один язык; не универсальный свободный агент с SQL/network tools.

Второй slice: существующие значения + предлагаемые личные статьи сохраняются через текущие authoritative actions с идемпотентными ключами; language/sense/destination questions переводят job в waiting_user. Генерация — не доказательство absence и не непосредственная write capability. Диалог просит только недостающую информацию; повторные однотипные разрешения не нужны после подтверждённого плана в согласованной области.

Третий slice: scoped карточный диалог использует тот же conversation/run service, но инструменты объяснения и личной заметки вместо import tools. Выбранный entry UUID и соседние значения фиксируются в context snapshot; ambiguous note destination уточняется. `user_word_notes` сейчас per-entry; точное соответствие бытового «карточка» entry или card_type — отдельное UX-решение, нельзя смешать с raw.notes авторской статьи.

Затем добавляются text/URL/file source adapters. Конвертация даёт единый текст+язык+source provenance; прочий import pipeline переиспользуется. Нужны SSRF/file size/MIME и privacy boundaries, а не разрешение модели произвольно читать сеть или файловую систему.

## Граница с параллельной #684

Соседняя задача «Спроектировать коллекции и обмен» уже имеет checkout684-collection-sharing-design и принятые решения: mixed common+author entries; saved shared changes доступны сразу, без обязательного Publish workflow в первом этапе. Здесь не вводим собственные папки/теги/публикационные версии. Import передаёт metadata и destination через согласованный collection interface. Channel ID — identity, channel name/title — отображаемые снимки. Source kind/filter и folder membership — разные поля: можно отфильтровать YouTube независимо от папки.

Пока folders/metadata runtime отсутствует, текущий account pilot создаёт плоские коллекции с источником/каналом в названии и описании, без обещания новых фильтров. При будущем batch-save подписчики могут видеть сохранённый частичный состав; import status/receipt должны это объяснять. Внутренние generated proposals перед сохранением не являются user-facing Publish стадией.

## Требования к первому инкременту

Server-auth principal; source preview revision и confirmed plan; owner-scoped conversations/runs/questions; bounded worker leases/checkpoints/retries; idempotency на source/import/item/save; persisted source text с retention/delete policy; per-task usage/step telemetry; source contents как untrusted data; server-only credentials. События прогресса — UX-канал, не единственное хранилище. Новая UI вкладка и contextual modal — представления одного conversation service, не два независимых агента с отдельной историей.

Рабочий предложенный набор инструментов: source.preview/read, dictionary.search/read, collection.destination/read, import.start/status/answer, personalEntry.propose/save, note.propose/save. Состав выдаётся по surface/run capabilities; saving требует согласованной области пользовательского запроса, а не фразы модели «пользователь подтвердил». Имена — дизайн, не существующие API.
