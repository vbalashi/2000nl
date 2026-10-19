# Новые видео: Luna high и адресный второй проход

2026-10-19, #742 / draft PR #748. Владелец предоставил два ранее не использовавшихся в пилоте видео: LUBACH `-mOpU9Wf-wg` (11:32), Easy Dutch `_XskmnKYQRs` (15:48). [Решение и границы](../../../discussions/2026-10-19-04-new-video-luna-agent-loop.md).

Вопрос: достаточно ли основного Luna high разбора и что добавляет адресная Luna high проверка с инструментами. Это external experiment, не интеграция в приложение. Source rights: публичные видео/субтитры использованы для разрешённого владельцем анализа; raw transcripts и dictionary contents не публикуются в Git.

Метод: авторские NL-NL captions через существующий AudioFilms provider для LUBACH; авторизованный full-audio ASR endpoint AudioFilms для Easy Dutch. Подготовка `prepare.py` сохраняет слова, леммы, контекст и offsets. `luna_video_run.py extract` проходит все подготовленные предложения,8/call; затем `review` выбирает max32cases по зафиксированным признакам,4/call, max4model turns. Четыре инструмента: context_read, source_search, dictionary_search, entry_read. Один least-certain proposed construction в review batch проверяется словарным поиском; остальные инструменты по необходимости. Поиск server-side owner-scoped, без передачи SQL/account identity модели; только read-only RPC. No dictionary/collection/progress writes.

Приватные checkpoints: `tmp/agent-import-742/newvideos-luna-20261019/`. [Результаты/usage/ограничения](RESULT.md) опубликованы; оба источника завершены. SDK trace export выключен, store=False, retries0; phase128requests и source fingerprints. Нет независимой gold-разметки: before/after additions не автоматически правильные, removals не автоматически ошибки первого прохода. Второй проход адресный, не полное повторное чтение видео.

Команды: caption capture → prepare → `luna_video_run.py extract VIDEO_DIR PHASE_DIR` → `luna_video_run.py review VIDEO_DIR PHASE_DIR --email AUTHORIZED_OWNER --reference REFERENCE_CHECKOUT`. ASR sources требуют `prepare.py --allow-asr`; new948s source использует `asr_capture.py --full-audio --max-video-seconds 1200`, сохраняющий старый default900.

Уточнение владельца: рабочий turn limit заранее не подбирать; выполнен отдельный review20 с natural tool choice, без forced finish после2tools. [Решение](../../../discussions/2026-10-19-05-measure-agent-steps-before-limits.md). Первоначальный review4 сохранён отдельно, включая turn exhaustion и interrupted sibling.
