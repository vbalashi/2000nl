# 2026-10-18: разрешён собственный AudioFilms ASR для двух источников

Владелец ответил на source-fallback question: использовать AudioFilms endpoint,
извлечь аудио и транскрибировать. Дополнительно подтвердил для Easy Dutch выбор
собственной транскрипции (автосубтитры допустимы, но собственную считает качественнее).
Это пользовательская оценка, не измеренное сравнение ASR/caption качества.

Продолжить IoTEYzkKF0M и9ZQaqL7K-rE через существующий API/worker без изменения
AudioFilms runtime/deployment. Затем тот же bounded12case import/draft slice.
Сохранять ASR source kind, engine/model, job status/receipt/timings. Не называть
ASR author captions и не утверждать точность распознавания без reference.

Обнаружено: public hostname403, старый LAN-IP недоступен; существующий Dell SSH
доступен, API127.0.0.1:3010 health ok, ASR file-queue worker ready. Внутренний вызов
API через SSH использует действующую конфигурацию, auth/ASR flags не менялись.
Queue maxActiveJobs1: запускать последовательно. Video lengths878/667s ниже900s
лимита; bounded duration jobs, no refresh. Easy Dutch audio metadata reports nl.
LUBACH language evidence не выдумывать; передать только подтверждённые поля,
соблюдать фактическую deployed endpoint validation.

Для модельного продолжения сохранить исходный transfer cap48requests: использовано18,
осталось максимум30newcalls. Отдельный journal/time window для ASR continuation с
prior-ledger, без автоматического обнуления расхода. Operator/Codex time и ASR compute
отдельно от Azure token estimate. Никаких production dictionary/collection writes.

## Фактический checkpoint

[ASR result](../research/agent-import-742/multivideo/ASR-RESULT-20261018.md):2jobs
completed (12:42 /3:16),24case SDK slice,6new drafts;21newmodelcalls ~$0.006306355.
Transfer cap inherited48, used39includingprior18; total66researchcalls. ASR currency
cost unknown, CPU/RAM/disk samples retained. LUBACH missing-audio-evidence rejection
resolved by real Whisper automatic language probe (nl0.996949), not fake metadata.
Discovery exact-case failure recovered offline with logged unique source-casing
normalization, no new model call.26tests pass. No generated dictionary/member writes
or app deployment. Canonical headword quality and all-dictionary completeness remain
open; fixture scope nl-vandale explicitly documented.
