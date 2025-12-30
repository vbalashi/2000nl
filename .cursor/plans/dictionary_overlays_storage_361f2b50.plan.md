---
name: Dictionary overlays storage
overview: "Спроектировать хранение оверлеев поверх immutable словарных карточек: (1) машинные переводы выбранных текстовых полей, общие для всех пользователей и подгружаемые по требованию; (2) пользовательские заметки (одно поле notes), персональные для каждого пользователя."
todos:
  - id: inventory-current-fetch
    content: Проверить, как сейчас UI/API получает `word_entries.raw` и где удобнее присоединять overlays (RPC vs Next.js API route).
    status: pending
  - id: design-sql-schema
    content: Сформулировать точные SQL миграции для `word_entry_translations` и `user_word_entry_notes` (constraints, индексы, RLS политики).
    status: pending
  - id: define-translatable-fields
    content: Зафиксировать whitelist полей/путей для перевода и исключения (_raw_html и т.п.), чтобы перевод был стабильным.
    status: pending
  - id: design-translation-flow
    content: Спроектировать on-demand flow с `pending`/гонками и сохранением результата после DeepL.
    status: pending
  - id: ui-merge-strategy
    content: Определить, как UI будет брать перевод для конкретной строки (по тем же индексам массивов) и где хранить кеш в клиенте.
    status: pending
---

## Контекст и ограничения

- Базовые карточки **immutable** и уже лежат в Postgres в `word_entries.raw` (JSONB) с ключом `word_entries.id` (см. [db/migrations/0001_create_schema.sql](db/migrations/0001_create_schema.sql)).
- Структура заметки/карточки соответствует текущей схеме (см. [packages/shared/schemas/nl/note.schema.json](packages/shared/schemas/nl/note.schema.json)) и UI-типам (см. [apps/ui/lib/types.ts](apps/ui/lib/types.ts)).
- Переводы нужны **на уровне целых строк/полей** (field-level), без подстрок.
- Пользовательские дополнения: **одно большое поле `notes`** на карточку.

## Что считаем «значимыми полями для перевода»

Переводим только пользовательский текст, который реально показываем и к которому нужен тултип:

- `headword` (опционально: можно переводить, но не заменять оригинал)
- `meanings[i].definition`
- `meanings[i].context`
- `meanings[i].examples[j]`
- `meanings[i].idioms[k].expression`
- `meanings[i].idioms[k].explanation`

Не переводим:

- `_raw_html`, `_metadata`, `audio_links`, `images`, `pronunciation*`, `verb_forms`, `conjugation_table`, грамматические поля (`part_of_speech`, `gender`, …)

## Формат «translation overlay»

Храним перевод как **sparse JSON overlay** той же формы, что и исходный note (чтобы UI мог адресовать перевод тем же путём и индексами):

- `overlay` (JSONB): содержит только переведённые строки в тех же позициях.
- пример: `{ "meanings": [ { "definition": "…", "examples": ["…","…"], "idioms": [ {"expression":"…","explanation":"…"} ] } ] }`
- Это лучше, чем «плоская таблица по каждому полю», потому что:
- UI получает 1 объект на карточку/язык и локально показывает тултипы рядом с фразами
- индексы массивов стабильны, потому что базовая карточка immutable

## Таблица для общих переводов (shared by all users)

Добавить новую таблицу (название можно подобрать под стиль схемы):

- `word_entry_translations`
- `word_entry_id uuid not null references word_entries(id) on delete cascade`
- `target_language_code text not null` (например `ru`, `en`)
- `provider text not null default 'deepl'`
- `status text not null default 'ready'` (варианты: `ready` | `pending` | `failed`)
- `overlay jsonb not null` (sparse overlay)
- `source_fingerprint text not null` (хеш «что переводили»: список путей+исходные строки; защита от будущих изменений пайплайна/карточек)
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Индексы/ограничения:

- `unique(word_entry_id, target_language_code, provider)`
- (опционально) `gin` индекс на `overlay` не обязателен, т.к. обычно читаем целиком.

## Таблица пользовательских заметок (per-user)

Добавить:

- `user_word_entry_notes`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `word_entry_id uuid not null references word_entries(id) on delete cascade`
- `notes text not null default ''`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Индексы/ограничения:

- `primary key (user_id, word_entry_id)` или `unique(user_id, word_entry_id)` + отдельный `id` (на выбор)

RLS:

- `user_word_entry_notes`: только владелец читает/пишет свои записи.
- `word_entry_translations`: можно разрешить `select` всем (или всем авторизованным), `insert/update` только сервисной роли/API.

## Поток получения перевода (on-demand, с кешированием)

1) UI знает `target_language_code` из настроек (например `ru`).
2) При наведении/первом открытии «переводов» для карточки UI дергает API:

- вход: `word_entry_id`, `target_language_code`
- выход: `overlay` (или `status=pending`)
3) API делает:
- `select` из `word_entry_translations` по `(word_entry_id, target_language_code, provider='deepl')`
- если найдено `ready` → вернуть.
- если нет:
- попытаться создать строку со `status='pending'` через `insert ... on conflict do nothing`
- только «победитель» конфликта выполняет вызов DeepL
- собирает пакет строк из значимых полей (см. выше), переводит массивом, собирает `overlay`
- делает `update ... set status='ready', overlay=?, source_fingerprint=?, updated_at=now()`
- остальные запросы в этот момент могут получить `pending` и UI покажет «перевод готовится» с повтором через короткий интервал

Примечание: можно начать без `pending` и делать синхронно «select → translate → insert», но `pending` решает гонки, когда два пользователя одновременно запросили один и тот же перевод.

## Доставка в UI (как показывать тултипы)

- В компонентах, где рендерятся `definition/context/examples/idioms`, добавить «иконку перевода» рядом с каждой строкой.
- При hover UI берёт перевод по тому же пути:
- исходная строка: `raw.meanings[i].examples[j]`
- перевод: `translation.overlay.meanings[i].examples[j]`
- Если перевода нет → показать «нет перевода» или «перевод готовится».

## Миграции/эволюция

- Добавить SQL-миграцию в `db/migrations/` с созданием двух таблиц + индексы + RLS политики.
- При необходимости заполнить `languages` кодами `ru/en/...` (если решим делать FK), либо оставить `target_language_code` без FK.

## Почему этот дизайн подходит под ваши требования

- **Immutable базовая карточка**: не трогаем `word_entries.raw`.
- **Переводы общие**: `word_entry_translations` не привязан к пользователю.
- **Пользовательские данные персональные**: `user_word_entry_notes` с RLS.
- **Лёгкое извлечение для нужного языка**: один запрос по `(word_entry_id, lang)` возвращает overlay целиком.
- **Тултипы “рядом с каждой фразой”**: overlay хранит переводы на уровне каждой строки/элемента массива.