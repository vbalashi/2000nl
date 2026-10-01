# Повторный production-замер после PR #517

Версия 0.18.1063, commit `40a6b8204e66ba55ca4dbf8e03ffc27ecdc5a207`, контракт `2000nl-db-194`, оба presentation-флага включены. Развёртывание: https://github.com/vbalashi/2000nl/actions/runs/36910836285.

Итоги: [2026-10-01-latency-after-deploy.md](../../discovery/2026-10-01-latency-after-deploy.md). Исходный аудит: [30 сентября](../2026-09-30-user-action-latency/README.md).

`raw/` содержит запросы без тел, cookies и токенов, UUID в путях скрыты. Request ID оставлен для серверной диагностики. `partial/` — первые 10 ответов прерванного прогона; они не входят в таблицы до/после.

`harness/` сохраняет точные варианты измерителей. Они добавляют тип оценки, безопасные параметры области и полную сводку фоновых запросов. При неактивном Continue измеритель открывает Adjust и запускает неизменённую настройку без сохранения нового пресета. Время подготовки этого экрана исключено из click→first-card, но его фоновые запросы могут влиять на старт. Collections выбирает именно VanDale Dutch, а не соседний synthetic-источник.

Запускать из корня checkout через `scripts/latency-audit/run.sh` с аргументом `../../docs/diagnostics/2026-10-01-latency-after-deploy/harness/train.mjs`; переменные окружения и разрешение QA описаны в production-latency-measurement runbook. Все семь сессий этого замера отозваны; файлов с токенами не осталось.
