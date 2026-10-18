# 2026-10-18: агент добавления учебных материалов

Источник: поручение владельца, #742 как подзадача #685, передача из отдельного
discovery-чата. Дата фиксации: 18 октября 2026.

## Задано владельцем

Встроенный агент получает двуязычный список, игнорирует английский перевод,
находит точные Dutch entries/значения/выражения и создаёт/дополняет коллекцию для
тренировки. Затем reviewed personal generation, chat/tools, YouTube через AudioFilms
и web/PDF. Отдельно изучить union двух коллекций, не объявляя отсутствующим уже
возможное смешивание private/base entries в одной manual collection или нескольких
dictionaries. Текущая сессия — principal; sharing/delegation отдельно #684.

Разрешены исследование, документы в собственной ветке и GitHub task organization.
Не разрешена большая runtime реализация, DB migration/deploy, production mutations,
добавление слов пользователям и платные/массовые запуски. Checkout603 и его партии
сохраняются без изменений. Эти ограничения соблюдены в discovery checkpoint.

## Предложено, не принято

Версионированный private plan и per-item receipts; один Apply для resolved subset;
text-only первая поставка без генерации; ограниченный job lifecycle и scoped undo;
общий reviewed-generation service с проверяемой приёмкой exact artifact; chat как
клиент доменных операций. Редакторское качество автоматического acceptance executor
требует отдельной оценки и не считается доказанным по runbook2.2.

Не решено: raw-input retention (предложение TTL7 дней), редактор/quality gate перед
автоматической приёмкой, разрешение Apply и partial-access политика будущего union.
Это конкретные предложения к поведению, не новые вопросы об уже заданном сценарии.

## Результат исследования

[Полный дизайн и источники](../research/agent-import-742/README.md),
[карта фактического кода](../research/agent-import-742-code-audit.md),
[proposed ADR0019](../adr/0019-agent-import-domain-plan.md).
Runbook2.2 hash подтверждён и документально закреплён. Реализация и deployed
проверка отдельно; live readiness и зависимости принадлежат GitHub/Project2.
