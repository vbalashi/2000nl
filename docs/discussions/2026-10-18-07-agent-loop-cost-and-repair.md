# 2026-10-18: продолжение agent loop, repair и стоимость

Источник: владелец разрешил продолжить внешний pilot, оценить необходимость tools,
варианты OpenAI/Foundry и стоимость обработки видео. Предыдущая запись:
[Azure pilot](2026-10-18-06-azure-agent-loop-pilot.md).

Принято: продолжить ограниченный эксперимент на том же источнике; ранее17calls
сохранены в учёте. Новая фаза cap12additionalcalls, фактически10. Новые tools не
понадобились. Реализовано только в research harness: короткие ссылки на IDs,
per-item acceptance, bounded repair feedback и обязательный дополнительный search
перед not_found при nonempty shortlist. Production integration не разрешена этой
записью и не выполнялась.

Новый pass: SDK12/12, Responses11/12 на development reference; все mechanical gates
пройдены, но Responses ошибся смыслом inbreken. Не считать один pass доказательством
production quality или превосходства SDK. Repair проверен негативными fixtures,
в live pass не потребовался. Следующий вопрос — held-out качество и отдельная
проверка смысла; fifth tool пока не обоснован.

[Отчёт и условный прогноз](../research/agent-import-742/agent-flow/RESULT-AZURE-V4-20261018.md):
SDK12cases ~$0.00283; все27experimentalcalls ~$0.02483 по published Azure rate.
Это не invoice. Если все298кандидатов ролика отправлять с той же средней ценой,
получится ~$0.0702 только resolver; полный video pass не измерен. При отправке
только спорных случаев цена ниже; transcription/generation/hosting отдельно.
OpenAI managed Agents API и Foundry project agents рассмотрены по officialdocs,
не запущены; существующий tested path — OpenAI SDK поверх Azure Responses.
