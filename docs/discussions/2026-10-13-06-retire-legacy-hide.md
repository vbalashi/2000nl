# Запрет старого hide и оставшиеся пользователи V1

Дата: 2026-10-13. Источник: владелец явно поручил запретить hide в старом API и серверной функции, не удаляя весь старый API. Задача #693; предшествующая очистка старых отметок отражена в #688 / PR #689.

## Принято и границы

Старый result=hide больше не принимается API /api/platform/actions и его /v1/actions alias, а handle_card_review отклоняет его до проверки обработанного turn. Колонка hidden, чтение исторического состояния и freeze остаются. Обычные оценки, Known, исключение значения/упражнения и история не меняются. Это не повторная очистка данных и не глобальная отмена V1.

## Исполнение

API использует прежний invalid-result ответ HTTP400. SQL возвращает legacy_hide_disabled (22023), удаляет старую ветку записи hidden=true и не допускает обход через consumed-turn shortcut. Migration225 проверяет точное тело предшественника, собранное из актуальных миграций, и сохраняет остальные guards, reference clock, ACL и Known trigger. Тело предшественника локального полного bootstrap совпало с production (read-only сравнение md5 prosrc).

Контракт225 добавляет точный SHA migration и chained read-only postflight. Запрет в production появляется только после reviewed PR и штатного развёртывания; самостоятельного production ALTER FUNCTION не выполняли.

## Аудит использования V1

Проверен текущий исходный код трёх репозиториев; это карта зависимостей, а не статистика production-запросов.

| Потребитель | Подтверждённое использование |
| --- | --- |
| 2000NL | lib/training/dictionaryService.ts: fetch-entry, create-user-entry, copy-to-user-dictionary через V1 actions; listService.ts: V1 search; platformV2TrainingMediaClient.ts: V1 audio/resolve. Перевод словаря использует unversioned alias /api/platform/translation. |
| AudioFilms | app/src/lib/twoThousandNlPlatform.ts: V1 proxy для translation, text-translation, audio/resolve, generated-entry/draft, session и legacy actions. dict/search/route.ts использует V1 search/catalog search. SenseCard lookup/actions имеют V2 путь, но legacy lookup/actions остаются отдельным поддерживаемым вариантом. |
| Pontix | src/scripts/platformClient.js фиксирует V1 lookup/actions для поиска и явных учебных действий: start-learning, mark-known, mark-unknown, review-card. |

Часть карточного V1 lookup/review устарела относительно V2, но V2 пока не заменяет всю поверхность V1: медиа, переводы, генерация/создание записей, поиск и профиль сессии остаются востребованы. Для полного retirement нужны отдельная карта паритета и миграция клиентов; совпадение номера версии с legacy-кодом не означает ненужность каждого endpoint. Репозитории AudioFilms/Pontix не изменялись.

## Проверка

До исправления route test принимал hide (200 вместо400), а два SQL теста не получали исключение — с новым и уже использованным turn. После: 376 FSRS/RPC tests, 69 API/contract tests, typecheck и lint (прежнее предупреждение handlePlayAudio) проходят. Полный postflight225 на одноразовой локальной базе и manifest validate прошли. Production deploy и браузерный тест не выполнены; UI не менялся.
