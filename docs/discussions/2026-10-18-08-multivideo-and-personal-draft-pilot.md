# 2026-10-18: новые видео и ограниченная генерация personal drafts

Владелец разрешил повторить SDK-проход на трёх видео (-lf71hdWm5E, IoTEYzkKF0M,
9ZQaqL7K-rE), показать implemented/missing части, попробовать ограниченные карточки
для выражений/meaning gaps. Следующий агент может создавать draft либо предлагать
генерацию; save в личный словарь+collection рассматривается будущим этапом.

Принято для внешнего пилота: existing lookup first; исходная форма/контекст/receipt
передаются отдельной роли генератора с закрытой схемой. Generated status обязателен;
proposed component links не объявляются существующими persistent relationships.
Не перепутать lemma/headword link с identity фразовой карточки. Никаких новых
production saves, enrollment/grades или app/schema/deploy изменений в этой фазе.

План: capture manual NL → preparation/lookup → frozen SDK resolver on new material
→ bounded generator role for supported unresolved expression proposals → mechanical
validation → local reviewable artifacts. Отдельно измерить stages/calls/tokens/cost.
Однозначность формы не доказывает contextual meaning; noisy syntactic proposals
не принимаются автоматически за отдельные выражения. Это новая development/transfer
выборка, не certified independent linguistic gold.

Начальная политика paid phase: до48новых model HTTP requests, read-only tools,
no retries, output≤4096tokens/call, общий deadline20min; прежние27calls учтены отдельно.
Не запускать массовый all-word resolver без bounds. До12resolver cases/video и
до4draft proposals/video для первого transfer slice; оставшиеся кандидаты сохраняются
в очереди с явной причиной, не выдаются за полностью обработанное видео.

Фактическая доступность: NOS manual NL доступна; Easy Dutch manual отсутствуют,
auto NL доступны; LUBACH не возвращает caption tracks. Разрешение на auto/ASR
запрошено отдельно, поскольку предыдущий source policy предпочитал author captions.
Это не блокирует подготовку NOS и draft harness.

## Фактический checkpoint

[Transfer result](../research/agent-import-742/multivideo/RESULT-20261018.md): NOS
processed12case slice,4draft generations invoked by resolver; relatedRefs all empty.
Batch2 exhausted3then6turns; operator-driven one-response finalization from saved
receipts, no repeat generation. Semantic mismatch gaan1/topic and questionable goed3
recorded; no production saves.18newcalls ~$0.00518817 list estimate, cumulative45.
20focused tests pass. Два остальных источника не обработаны без fallback choice.
