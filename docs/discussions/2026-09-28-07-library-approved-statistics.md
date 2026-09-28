# Library одобрен; первый минимальный экран Statistics

Дата: 2026-09-28. Пользователь одобрил текущий вариант Library: Explanation / Example без линий, внутри soft block, текст с небольшим отступом. Других замечаний к этому экрану сейчас нет. Запросил переход к минимально приемлемой статистике.

## Зафиксированный Library

nestedReading=literary, roleLabels=plain, nestedTextInset=inset — defaults прототипа. Подтверждение визуального варианта не означает production rollout.

## Statistics — предложение для обсуждения

В существующем StatisticsDestination есть показатели текущего учебного дня и сводный прогресс. Современный exercise stats read model различает newCardsToday, reviewCardsDone, reviewCardsDue, totalCardsStarted и totalCardsInScope. Истории по дням в этом контракте нет.

Новый изолированный StatisticsPrototype использует эти пять понятий с явно демонстрационными числами. Блок Today: New cards / Reviews completed / Due now. Прогресс: started / not started, без приравнивания started к mastered. Words / Idioms — демонстрационные области для проверки структуры, не подключённая агрегация platform. Смысл production scope, study-day boundary и сопоставление Words с реальными типами карточек нужно подтвердить при интеграции.

Есть First visit с нулями, раскрываемое About these numbers и Go to training. Исторические графики, streak и проценты усвоения не выдуманы. Общая ширина 840 px, Lavender и существующая навигация сохранены. Прямой маршрут: /dev/session-builder-prototype?view=statistics.

## Проверки

Typecheck и focused lint прошли. Browser desktop и 412 px: переключение Words/Idioms, First visit (aria-valuenow=0), With activity и переход к Training работают. Только dev-прототип, без сетевых запросов и изменений прогресса. Экран Statistics ещё не одобрен владельцем.
