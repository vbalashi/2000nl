# Новые видео: Luna high + адресная агентская проверка

2026-10-19. Статус: владелец согласовал pilot и предоставил два новых видео: `-mOpU9Wf-wg`, `_XskmnKYQRs`. Цель — проверить пригодное владельцу качество Luna, а не добиться абсолютной полноты.

Вне приложения: авторские NL субтитры LUBACH; собственная AudioFilms ASR для Easy Dutch (948sec, full audio, операторский лимит явно расширен до1200sec только флагом; default900 сохранён). Caption adapter допускает provider language nl-NL с сохранением оригинального кода и canonical nl. AudioFilms runtime/auth/deployment не меняются.

Первый Luna high проход покрывает все подготовленные предложения и сохраняет конструкции с исходными token IDs. Второй Luna high проход адресно проверяет исходные ответы на пропуски/смысл/границы, имеет read-only tools для соседнего контекста, поиска текста и доступных словарных результатов. Нельзя передавать эталоны прошлых видео; передаётся краткая проверенная политика. Сохранять ответы/историю инструментов/usage, дедуплицировать исходные токены, явно проверять покрытие case IDs и допустимые ссылки. Не считать валидный JSON лингвистической гарантией.

Плановый лимит нового model phase:128HTTPrequests aggregate на два видео,8192output tokens/request,96KiB/request,8MiB cumulative,45minactive model phase; отдельные видео продолжаются из сохранённых checkpoints; zero retries, no trace export/store. Dictionary reads existing owner-scoped maintenance path, не model-supplied user identity/SQL; no collection/dictionary/progress writes. Проверка дополнительных находок сравнивает before/after и сохраняет спорное, без заявления об independent human gold. Sol и DUCAME не входят в основной поток этого опыта.
