# Ограниченное восстановление ожидающего sentence-перевода

2026-10-17. Issue #736. Источник: владелец поручил начать согласованные параллельные исправления после аудита; куратор выделил sentence recovery в отдельный поток.

Принятое направление: сохранить initial subscribe-before-read и reconnect reconciliation из #731, подготовку ответа #733 и непрерывность #728. Владелец слоя — TrainingSentenceSession: ожидание одного owner/session/run/entry/language сохраняет подписку во время фонового чтения; конкурентные recovery hints объединяются в одно последующее чтение. Старое чтение отменяется и ограждается generation при смене identity. Готовность, ошибка и terminal прекращают pending subscription.

Отдельный трёхсекундный таймер удаляется: резервные проверки принадлежат существующему recovery механизму (видимая вкладка, degraded раз в минуту, healthy раз в 15 минут, focus/visibility). Пятиминутный предел прежнего таймера не был общим пределом recovery и не останавливал join-loop. Durable translation operation и её бюджеты не меняются.

Согласованный seam теста — фактический TrainingSentenceSession с настоящими recovery, dictionaryTranslationEvents и registry, подменены только внешняя доставка событий и загрузка/действия. Red: при десяти шагах по 5 мс loader вызывался 11 раз вместо initial + join reconcile (2), без domain event и без достижения polling timer. Это локальное воспроизведение, не production rate.

Статус: направление принято в рамках #736; реализация и независимое review отдельно. Общий Training engine, server API, оценки, selection и FSRS не меняются.
