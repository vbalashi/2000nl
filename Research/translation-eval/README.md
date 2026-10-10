# Оценка переводов — отдельное направление

Владелец: #657, https://github.com/vbalashi/2000nl/issues/657.
Ветка `codex/657-translation-eval`, база `4c5d0f266be3`.
Это исследование переводов существующего значения. Генерация нидерландских
статей, её входы, принятые статьи и журналы не изменяются.

## Структура

- `prompts/dictionary-meaning-v1/` — неизменённый runtime baseline.
- `prompts/dictionary-meaning-v2/` — отклонённый эксперимент: варианты появились,
  но baseText иногда стал исходным словом/транслитерацией.
- `prompts/dictionary-meaning-v3/` — кандидат с явным целевым языком baseText.
- `cases/preflight-v1.json` — три development-примера для проверки транспорта.
- `cases/development-v1.json` — 12 оригинальных диагностических примеров RU/EN.
- `cases/validation-v1.json` — шесть новых примеров после фиксации v3, включая
  другой смысл bank и idiom-only. Не использовать для следующей настройки v3.
- `model-profiles.json` — имена моделей, параметры и имена env-профилей; без
  endpoint URL, ключей и непроверенных тарифов.
- `runs/<run-id>/` — локальные immutable manifests, снимки входов/промпта/кода,
  jobs, attempts, responses, assessments, drafts и reviews. Игнорируются Git.
- `evidence/` — только проверенные безопасные материалы, разрешённые для Git.
- `comparisons/` — локальные отчёты сравнения; `decisions/` — отдельные решения
  о кандидате. Успешный прогон не означает принятие или production rollout.
- Код CLI: `apps/ui/scripts/translation-eval/`.

## Воспроизводимый прогон

Из `apps/ui` (вместо алиаса ниже можно вызвать vite-node напрямую):

```sh
node node_modules/vite-node/vite-node.mjs scripts/translation-eval/cli.ts prepare --run development-gpt41-v3 --model gpt41
```

Без `--write` prepare только показывает план. Для фиксации добавить `--write`.
Модель выбирается из `gpt41`, `luna56`, `luna6`; промпт задаётся через `--prompt`,
набор через `--suite`, повторность через `--repeat`. По умолчанию 12 вызовов,
2200 output tokens на запрос, 600 секунд на run, без повторов транспорта.
После подготовки:

```sh
node node_modules/vite-node/vite-node.mjs scripts/translation-eval/cli.ts execute --run development-gpt41-v3
node node_modules/vite-node/vite-node.mjs scripts/translation-eval/cli.ts execute --run development-gpt41-v3 --live
node node_modules/vite-node/vite-node.mjs scripts/translation-eval/cli.ts evaluate --run development-gpt41-v3 --write
node node_modules/vite-node/vite-node.mjs scripts/translation-eval/cli.ts review-template --run development-gpt41-v3 --review semantic-v1 --write
```

execute без `--live` не читает секреты и не вызывает провайдера. Live credentials
читаются в память из существующего project env (переопределяется `--project-env`)
или `~/.config/ot-learning/azure.env`, отдельно по модели. Секреты и URL не
копируются в run. Профили фиксируют необходимые разные transport settings:
GPT-4.1 temperature=0; Luna reasoning_effort=low, без temperature. У всех
одинаковый лимит completion tokens; reasoning tokens входят в этот лимит.

Завершённые ответы пропускаются при resume. Неизвестная/неуспешная попытка
останавливает продолжение: сначала сверить расход, затем создать явно новый
run. Автоматических retries нет. Lock защищает от одновременного execute.
Deadline начинается при первом execute и не обновляется при resume.
Запрос фиксируется до отправки; response сохраняет исходный content, parsed
result, served model, usage, elapsedMs и hash тела запроса. Output token cap
и call cap ограничены. Замороженные оригинальные fixtures небольшие; CLI не
заменяет production-валидацию произвольных новых входов. Строгий общий
денежный лимит не заявляется: тариф Azure пока не подтверждён.

## Оценка и сравнение

1. Структура: production parser, сохранённые fieldId/order, завершённый ответ,
   совпадающая served model. Ошибки не считаются успешной генерацией.
2. Автоматическая лексическая диагностика: primary, варианты, контрольные слова,
   baseText и совпадения с небольшими разрешёнными наборами. Новый корректный
   эквивалент вне набора требует проверки, а не автоматического удаления.
3. Содержательная оценка КАЖДОГО ответа: sense fidelity, полезность эквивалентов,
   естественность, точность content-переводов, baseText. Оценки 0–5, причина,
   закрытые коды ошибок, decision accept/reject/needs-work. Рубрика в `RUBRIC.md`.
   Автор оценки фиксирует метод agent/model/human. Агент не выдаёт свою оценку
   за человеческую. Draft не считается завершённым review.
4. `submit-review --run ... --file ... --review semantic-v1 --write` проверяет
   полноту, шкалу, коды и hash каждого ответа, затем сохраняет review отдельно.
5. `compare --runs run-a,run-b --comparison models-v1 --write` требует одинаковый
   suite/repeat/output cap. В отчёте остаются identities модели и промпта;
   параметры моделей не маскируются. Сравнение автоматических сигналов не
   подменяет содержательную приёмку. В текущем CLI reviews читаются отдельно.

Не оптимизировать число вариантов как самостоятельную цель. Нужны корректные
эквиваленты ОДНОГО значения; пустой массив нормален. Проверять primary и base,
definition, примеры, идиомы и объяснения. Сначала development, затем замороженный
кандидат на validation; после анализа validation нужна новая версия набора для
дальнейшей настройки. Малые прогоны с одним draw не доказывают надёжность модели.

Стоимость: сохраняются фактические prompt/completion usage и latency; неизвестный
расход отмечается явно. Денежная стоимость null до получения тарифа с валютой,
датой, единицами и источником. Исторические публичные reference rates из article
pipeline не являются подтверждённым тарифом этих Azure endpoint'ов.

Runtime prompt и модель приложения пока не меняются. Для принятия нужны review,
регрессии и отдельное решение о lazy cache refresh и rollout.

## Первое сравнение

[Инвентаризация](PROMPT-INVENTORY.md) и [отчёт 10 октября](REPORT-2026-10-10.md).
Анонимная оценка: `python3 Research/translation-eval/scripts/render-review.py
--runs development-gpt41-v3,development-luna56-v3,development-luna6-v3,validation-gpt41-v3,validation-luna56-v3,validation-luna6-v3
--output-dir Research/translation-eval/runs/review-new`. HTML сохраняет оценки
локально в браузере и экспортирует черновик JSON; отдельный blind-key.json
раскрывает модели после оценки. Экспорт анонимной страницы не является готовым
per-run review для submit-review: его нужно связать через ключ и заполнить коды.

Содержательная [агентская оценка 54 ответов](SEMANTIC-REVIEW-2026-10-10.md):
49 accept, 5 needs-work. Это отдельный этап после автоматических проверок;
решение — расширенная проверка до production promotion, GPT-4.1 пока остаётся default.

## Персональные промпты моделей

[План равного бюджета](MODEL-TUNING-PLAN-2026-10-10.md) и
[результаты 144 вызовов](MODEL-TUNING-RESULTS-2026-10-10.md). Две tuning-итерации
на модель, новая общая validation, baseline и tuned, по три повтора.
В `runs/review-tuning-{gpt41,luna56,luna6}-v2/index.html` — новые анонимные
страницы сравнения внутри модели. Оценки агента/источники/ограничения сохранены
отдельно в evidence/model-tuning-2026-10-10; итог не меняет production default.

- [Full100 results, measured costs and retry amendment](FULL100-RESULTS-v1.md):
  100 real meanings; common v4 selected before70-case held-out evaluation;
  390 first-attempt protocol calls plus1 separately logged recovery. Anonymous
  local review: `runs/review-full100-v1/index.html`.
