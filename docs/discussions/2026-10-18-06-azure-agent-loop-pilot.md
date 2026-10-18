# 2026-10-18: разрешён и выполнен первый Azure agent-loop pilot

Владелец разрешил сделать первый проверяемый инкремент с4tools, Responses API и
Agents SDK, проверить Azure варианты; предложил то же/новое видео. Выбрано то же
видео для контролируемого development comparison, другой источник — будущий held-out.

Выполнено на существующем Azure gpt-6-luna: ручной Responses loop и local Agents SDK
через один Azure client.4read-only local snapshot tools,12frozen cases,3development
итерации,17HTTP calls. Model самостоятельно запрашивает dictionary_search.
Остальные3handlers отдельно smoke-tested, не объявляются выбранными live model.

[Результаты и все ограничения](../research/agent-import-742/agent-flow/RESULT-AZURE-20261018.md).
Direct-v1 после offline исправления нашего evidence validator совпадает12/12 с
supervised reference, baseline8/12. SDK имеет valid/invalid outputs и retrieval
false negatives; последний6case smoke5/6, что не является head-to-head сравнимой
новой метрикой всей выборки. Нельзя заключить о превосходстве framework или полной
автономной готовности.17usage receipts сохранены, цена в валюте не подтверждена.

No app/schema/deploy/collection changes. SDK trace export disabled, Azure-only
inference, credentials только в памяти, source/requests/labels в ignored evidence.
Next: code-enforced retrieval completion, short evidence aliases, partial item gate,
затем frozen/held-out quality run. Новые платные calls по остатку лимита не запускать
без конкретной необходимости; limit18 inherited acrossattempts, used17.
