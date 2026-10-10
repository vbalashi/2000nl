# Повторы и диагностика переводов

Дата: 2026-10-10. Источник: комментарий владельца к HTTP500 в full100, #657.

Принято: логировать тип и этап ошибки, предусмотреть до трёх повторных
попыток после исходного вызова, затем разбирать исчерпанные случаи по логам.
Это технический transport recovery, не содержательный judge/review карточки.

Реализация: transient HTTP429/5xx, timeout/network повторяются с ограниченным
backoff; permanent HTTP4xx и ошибки контракта сразу становятся диагностируемой
ошибкой. До3 retries означает максимум4 вызова. Логи: correlation ID, attempt,
stage, closed failure code, HTTP status, allowlisted request ID, duration,
known usage, retry decision/delay. Не писать raw provider message, URL, ключи,
тексты карточек. Public artifacts сохраняют старую безопасную форму failure.

Full100 исходная frozen first-attempt выборка остаётся неизменной. Recovery
HTTP500 записывается отдельным новым прогоном, а затраты и eventual outcome
считаются отдельно; не улучшать задним числом first-pass reliability/quality.
Исходный провайдерский body HTTP500 не был сохранён, поэтому root cause этой
конкретной ошибки ретроспективно неизвестен. Новая диагностика не может его
восстановить.

Production prompt/model не меняются; retry/logging code отдельно проходит
проверки и review до выпуска. Семантические ошибки — отдельная очередь жалоб,
а не слепой повтор всех переводов.
