# #299 — Обнаружение обновлений, безопасное обновление и новости

Дата: 2026-10-17. Статус: product flow accepted / technical plan proposed / runtime not implemented.
Owning issue: https://github.com/vbalashi/2000nl/issues/299
Ветка: codex/299-release-update-plan; база: e05074df.
[Обсуждение](../../discussions/2026-10-17-01-release-updates-and-news.md).

## Цель и границы

Пользователь узнаёт, что открытая вкладка устарела, видит краткую новость
со ссылкой в блог и может обновиться одной кнопкой в браузере/PWA.
Владелец реализации — apps/ui: отдельный release-модуль, тонкий API route,
один coordinator в общем shell и компактный UI. Не расширять training renderer
логикой релизов. DB, FSRS, platform APIs и внешние клиенты не меняются.
Не создаём push, SSE/WebSocket, CMS, новую БД, блог или офлайн-режим.

## Проверенное текущее состояние

- lib/appVersion.ts — версия, полный commit и buildTimestamp из существующих
  NEXT_PUBLIC_APP_* переменных. next.config.js, scripts/next-build-with-metadata.js,
  Dockerfile и .github/workflows/deploy-nuc.yml уже передают метаданные.
- app/api/health/route.ts использует тот же appVersionInfo; health остаётся
  operational endpoint, polling не должен запускать deep DB checks.
- public/manifest.json задаёт standalone/start_url; по поиску serviceWorker,
  skipWaiting, workbox и caches в tracked runtime регистрации SW не найдено.
  Это аудит исходников, не доказательство отсутствия исторического SW на устройствах.
- 17 октября production GET health: e05074df, 0.18.1337, DB227, status ok.
  HEAD /: Cache-Control s-maxage=31536000, cf-cache-status DYNAMIC,
  x-nextjs-cache HIT. HEAD /api/health: Cache-Control no-store.
  Длинный shared-cache TTL требует проверки HTML/RSC/proxy правил; он сам
  по себе не доказывает, что CDN отдавал старый документ.
- Инцидент: старая вкладка без второго языкового control; reload восстановил
  control и сохранённый English. Ошибки генерации переводов здесь не проверялись.
- Существующая #299 требует дизайн в Pen до runtime implementation, reuse
  release identity и phone/desktop без сдвига навигации.

## Предлагаемый HTTP-контракт

GET /api/app-release, публичный, same-origin, без запросов к БД и cookies-dependent
данных. Server route force-dynamic; Cache-Control: no-store; клиент fetch с
cache: no-store. Проверить заголовки также через публичный proxy.

```json
{
  "schemaVersion": 1,
  "build": {
    "version": "0.18.example",
    "commit": "full-git-sha",
    "buildTimestamp": "2026-10-17T08:00:00Z"
  },
  "announcement": null
}
```

Необязательный announcement:

```json
{
  "id": "two-card-languages-v1",
  "publishedAt": "2026-10-17T08:00:00Z",
  "locale": "en",
  "title": "Translations in two languages",
  "summary": "Short editorial text about the released change.",
  "detailsUrl": "https://example.invalid/blog/two-languages"
}
```

URL здесь иллюстративный, не production-конфигурация. Только проверенная HTTPS
ссылка; текст как plain text, без HTML. Предлагаемые лимиты: title 100,
summary 360, URL 2048 символов; визуально до трёх строк и полный доступный текст.
announcement может отсутствовать/null; detailsUrl может отсутствовать — тогда
ссылку не рисуем. Не генерировать тексты из коммитов автоматически. Начальный
контент — reviewable файл в apps/ui/config, поставляемый с образом приложения.
Точная дата публикации редакционная; не подменять её датой запуска контейнера.

Build — тот же объект из appVersionInfo, без второй независимой нумерации.
Полный commit + buildTimestamp идентифицируют сборку; version — display label.
Сравнение по различию identity, не по числовому «больше»: откат тоже требует
предложить загрузить обслуживаемую сервером сборку. Для dev/missing metadata
не объявлять обновления по постоянно меняющемуся времени; показывать unknown.
Клиент не отправляет идентификатор пользователя/текст тренировки.

## Обнаружение и состояния

- Проверка после mount, на focus/visibility visible/online; debounce этих событий
  и минимум 60 секунд между фоновыми проверками. Пока visible — каждые 5 минут
  с небольшим jitter. Скрытая вкладка не опрашивает; ручная проверка доступна.
- Один in-flight запрос, timeout 5 секунд, AbortController/unmount cleanup.
  Ошибки и offline не блокируют запуск; backoff до 15 минут, online/manual
  дают повтор. Невалидный ответ не означает «у вас последняя версия».
- Состояния: checking, current, updateAvailable, deferred, updating,
  updateFailed, offline/unknown. Показывать доступную версию отдельно от
  загруженной. Обновление не очищает запросы/данные обучения.
- Первое открытие уже актуальной сборки: можно показать её новость без кнопки
  обновления. Пустой announcement: обычное сообщение о версии, без пустой карточки.
- seen/dismissed announcement id хранить локально с namespace приложения и
  аккаунта; для anonymous отдельный namespace. Ошибка storage не блокирует UI.
  Клик «Подробнее» не означает успешное обновление. Закрытие новости не скрывает
  постоянную доступность действия обновления; badge новости и badge версии раздельны.
  В первом этапе состояние прочтения не синхронизируется между устройствами.
- Другие вкладки обновляются независимо, без принудительного reload через broadcast.
  Storage event может синхронизировать локальную прочитанность, но не auth/run state.

## Кнопка «Обновить приложение»

1. Повторно получить целевую серверную сборку и проверить доступность сети.
2. Использовать существующего владельца training lifecycle/turn-controller для
   признаков active run, pending grade/undo и безопасной точки. Не вычислять их
   по DOM и не создавать альтернативный resume-record. Во время активной
   тренировки предложить отложить до завершения; pending mutations запрещают
   reload. Сохранность resume при refresh нужно доказать тестом, а не обещать.
3. Перед навигацией записать только короткую update-attempt receipt в
   sessionStorage: target identity, исходный same-origin URL, счётчик попытки.
   Без текста карточки, токенов и копии прогресса. При недоступном storage
   предусмотреть URL-marker с публичной target identity и bounded fallback.
4. Для текущего приложения без SW: полная document navigation через
   location.replace к текущему URL с одним служебным release query marker;
   сохранить остальные query/hash. HTML/RSC свежесть обеспечить корректными
   заголовками no-cache/revalidation (или no-store для shell после проверки
   Next поведения), proxy rules и immutable hash-named assets. Одного
   router.refresh недостаточно для замены загруженного JS.
5. Если обнаружен SW: сначала инспекция scriptURL/scope и доказательство владения.
   Не unregister неизвестные registrations и не удалять все origin caches.
   Только для собственного SW с утверждённым протоколом: update(), ожидание
   готовности, явная активация waiting worker и bounded controllerchange.
   Не добавлять SW только ради этой кнопки. Исторический/неизвестный SW —
   диагностируемая ветка восстановления, не разрешение удалять чужие данные.
6. После нового mount сравнить compile-time identity с receipt и свежим ответом.
   Только совпадение с обслуживаемой сборкой означает успех. Если релиз
   сменился за время перехода — пересчитать цель. При старой сборке/ошибке
   показать retry; автоматических циклов reload нет. Удалить служебный marker
   после успешной проверки, не теряя destination/query/hash.
7. Auth, cookies, localStorage, IndexedDB, resume records, словари/аудио не
   очищать. Cache Storage чистить только по явному allowlist принадлежащих
   приложению versioned shell caches, если такой владелец будет введён.

Браузер не предоставляет переносимую команду очистки всего HTTP-кэша сайта.
reload(true) работает как cache bypass только в Firefox. Не использовать
Clear-Site-Data как обычное обновление: оно может затронуть авторизацию/данные.
Обновление JS не гарантирует немедленную замену установленной иконки/OS splash.

## Принятый продуктовый флоу и визуальная доработка

[Согласование владельца](../../discussions/2026-10-17-02-release-updates-flow-approved.md).
Без третьей кнопки в шапке. Точка на настройках, временная плашка на любой
странице и постоянный раздел Updates. Показ плашки откладывается до завершения
активной тренировки. «Позже» сохраняется по target build identity локально:
повторные polling/navigation не открывают её снова для той же цели; новый
релиз может показать новую плашку. Недоступность storage не блокирует интерфейс,
в пределах текущего mount dismissal сохраняется в памяти.

Точка = updateAvailable OR unreadAnnouncement. Открытие Updates отмечает
показанный announcement id прочитанным; устаревший клиент сохраняет точку.
После успешного обновления проверить обе причины независимо. «Подробнее»
открывается отдельно с noopener/noreferrer. Updates показывает короткую новость,
кнопку обновления, версии, дату и ручную проверку. Отдельный About не добавлять.
При актуальной сборке нет кнопки обновления; unread news может оставлять точку.

Концепт с боковым Settings при активной Library — ошибка генерации, не требование.
Активная навигация всегда соответствует destination. В общем app frame доработать
phone/desktop: current/empty, update + news, update без новости, unread/read,
deferred active training, updating, offline, failed/retry, post-update news.
Предусмотреть клавиатуру, focus, aria-live polite и отсутствие повторных
объявлений при каждом polling. Композиция утверждена словами; точные размеры,
responsive layout и ошибочные состояния ещё не финализированы.

## Срезы реализации и критерии

1. Согласовать этот контракт, Pen states и язык новостей. #299 остаётся owning issue.
2. Release domain + API + config schema; tests same/different build, rollback,
   missing dev identity, malformed/empty announcement, invalid URL, no-store.
3. Coordinator + общий notification UI; fake timers для focus dedupe, polling,
   backoff, offline и independent dismissal. Typecheck/lint + targeted Vitest.
4. Safe update orchestration + training boundary; реальный lifecycle seam для
   in-flight grade/undo и resume. Не менять FSRS для обновления приложения.
5. Двухсборочный production-mode browser harness: открыть A, сервер заменить B,
   focus → баннер → кнопка → новый document B → подтверждённый успех.
   Повторить rollback B→A, reload failure, релиз C во время обновления,
   active run, network loss, отдельную вкладку и сохранность логина/языков.
6. Проверить Chrome desktop, установленный Android PWA и iOS standalone
   на доступных реальных устройствах; недоступные платформы явно отмечать.
   Без этих проверок не заявлять универсальный PWA all-clear.

## Выпуск и ограничения

Сначала выпустить клиент, умеющий проверять версии; уже открытые старые вкладки
не получат этот новый механизм задним числом — потребуется один обычный reload.
Затем второй тестовый релиз доказывает обнаружение. Проверить public response
headers, content identity и что metadata публикуется атомарно с образом.
Нельзя анонсировать release из CI до того, как соответствующий образ обслуживает
трафик. При смешанных replicas исключить flip-flop до полного rollout.
Откат — образ и его metadata вместе; DB изменений нет.

Совместимость API сейчас не измеряется идентичностью commit. Не вводить
mandatory update/minimum version без отдельного backward-compatibility договора.
Доставка произвольных новостей между релизами, история многих сообщений,
персональные аудитории, CMS и push — отдельные будущие задачи.

## Источники платформенных ограничений

- https://developer.mozilla.org/en-US/docs/Web/API/Location/reload
- https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/update
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control

## Контрольная точка

Только документация, runtime не реализован. Продуктовый флоу принят; нужны визуальная доработка и проверки
из срезов выше; существующий production и активные worktrees не меняются.
Checkout сохраняется для дальнейшего планирования/дизайна, не retirement candidate.
