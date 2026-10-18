# 2026-10-18: агентский цикл с дополнительными tools

Владелец просит спланировать агентские потоки/запросы и понять, как специализированный
агент сам выбирает следующий инструмент, получает дополнительную информацию и
продолжает цепочку. Это запрос на дизайн перед новым автоматическим экспериментом,
не разрешение на app integration/новый paid mass run.

Предложено: code coordinator stages и один bounded read-only resolver loop для
ambiguity/context/expressions; не отдельный LLM call на каждый token и не swarm.
Extraction role отдельно для mixed lists; missing personal draft role отдельно.
Unresolved — outcome, затем reason-based code routing, не автоматический вызов
следующего агента. Tool execution, authority, caps, receipts и collection Apply
принадлежат runtime code. HTTP/MCP для локального pilot не обязательны.

[Конкретный agent-flow design](../research/agent-import-742/agent-flow/README.md)
содержит4read tools, task/output contracts, versioned role prompts, schema example,
runner sketch, proposed budgets, evaluation plan и primary OpenAI docs sources.
Предлагаемый первый runtime — явный Responses loop; Agents SDK возможен для
turn/tool/handoff orchestration, но не заменяет domain durability/access/semantics.
Provider/model/budget ещё не выбраны; реализованный supervised pilot не объявляется
автономной agent chain. Текущая live collection не менялась в этом design turn.
