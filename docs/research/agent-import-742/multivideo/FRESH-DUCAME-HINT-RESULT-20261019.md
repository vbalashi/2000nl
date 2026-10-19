# Свежие предложения: есть ли дополнительные подсказки DUCAME

2026-10-19. #742, draft PR #748. [Протокол до запусков](../../../discussions/2026-10-19-03-fresh-ducame-hint-test.md).

**На этой выборке дополнительных строгих находок нет.** Самостоятельный Sol предложил 10 конструкций; DUCAME нашёл одну, уже присутствующую у Sol с точно теми же исходными токенами. Нового материала для дополнительного агентского просмотра не появилось. Поэтому control/hinted review не запускались: их результаты и эффект подсказок не измерены.

## Выборка и порядок

Взяты по4 предложения из NOS, Easy Dutch, LUBACH: всего12. До запусков зафиксированы seed `742-fresh-ducame-20261019-v1` и hash-rank по video/sentence ID. Фильтр:12–35 слов; исключены прежние32 central sentences и совпадающие соседние тексты. Доступные пулы27/47/25 предложений. Искусственные предложения и ручной поиск подходящей идиомы не использовались. После результата выборка не менялась.

Это новые предложения относительно прежнего сравнительного benchmark, **не новые видео** и не гарантированно невидимые всем прошлым полновидеопроходам. Независимой человеческой gold-разметки нет. Отсутствие дополнительных DUCAME-предложений не доказывает полноту ответа агента.

Порядок соблюдён:

1. Blind extraction Sol low через прежний Agents SDK / Azure Responses путь, два батча8+4. Source text и token IDs, без словарных подсказок, эталонных выражений и ответа другого агента. Ответ сохранён до подготовки DUCAME.
2. Разбор12 исходных предложений Alpino и независимый автоматический shortlist по трём lemma views. Выбрана41 каноническая запись, затем строгие XPath-запросы и извлечение исходных компонентов. Новых canonical parses28, остальные из прежнего кеша. Исключений/невалидных привязок0.
3. Новизна определяется по исходным токенам внутри того же предложения: IoU≥0.5 с любой baseline unit считается уже покрытым, остальные strict units пошли бы в review. Такой порог может скрыть более специфичную единицу внутри широкой — это ограничение автоматического фильтра. В данном единственном совпадении токены **полностью одинаковы**, порог на вывод не влияет.
4. Дополнительных strict hints0; сохраняется пустой список и пропускаются все четыре запланированных control/hinted API-вызова. Near-miss сознательно не передавались как подтверждённые конструкции.

## Конкретный пример

Исходное предложение LUBACH s5, case f09:

> Je had het net zelf over de nuance, die toch vaak ontbreekt.

Самостоятельный агент: **het hebben over iets**, token IDs `[1,2,5]` — *had het … over*.

DUCAME: **iemand zal het over iets hebben**, DCM14090, те же token IDs `[1,2,5]`.

Это подтверждение уже найденного выражения, а не случай «словарь заметил, агент пропустил». В остальных11 предложениях строгих DUCAME-находок не было. Среди исходных агентских предложений также `schrikken van iets`, `afspraken maken met iemand`, `gaan over iets`; их качество отдельно не объявляем доказанным только потому, что агент их вернул.

## Расходы и время

- Model HTTP requests2, responses2, HTTP200, unknown usage0;4 244 input tokens,770 output tokens. Usage сообщил4 238 cache-write input и6 ordinary input, cache-read0.
- Публикуемая оценка **$0.018307**, не invoice: применены GPT-6 Sol Global Standard short-context ставки к deployment `gpt-6.1-sol` как явно указанное ценовое допущение; фактический meter/billing не сверялся. [Ставки Microsoft](https://azure.microsoft.com/en-us/blog/gpt-6-astra-sol-and-luna-for-production-agents-in-microsoft-foundry/) проверены2026-10-19. В оценку не включены Alpino, сервер, старые транскрипции и подготовка источников.
- Blind batches10.88s и8.22s. DUCAME canonical/matching stage7.27s после готовых source parses. Это разные стадии, а не полное время нового видео.
- Новых публичных parser HTTP requests40:12 источников и28 canonical forms. Публичный endpoint не имеет принятого нами production SLA/тарифного контракта.
- Точное UTC-окно, наблюдаемые response model IDs и токены: [JSON](FRESH-DUCAME-HINT-RESULT-20261019.json). Шесть maximum model calls, ноль автоматических retries, disabled trace export, `store=False`, destination/model/output/byte guards. Фактически использованы только2calls.

## Воспроизводимость и статус

Runner `scripts/research/agent-import-pilot/fresh_hint_test.py`: `prepare` → `baseline` → `parse-sources` → отдельный `ducame_shortlist.py` → `review`. Общий `--study` указывает на изолированную папку. Для prepare нужны `--sources` и `--old-reference`; для review `--dictionary <dictionary/result.json>`. Словарный runner получает замороженный reference, `--source-cache <study/source-cache>`, подготовленный `--alpha` и отдельный `--out <study/dictionary>`. Canonical cache можно скопировать из прошлых экспериментов до запуска; в данном запуске это сделано и отражено в числе новых запросов.

Baseline сохраняет fingerprints, отклоняет несовпадающий resume и сохраняет ошибки. Parser source stage требует сохранённый baseline. Три focused tests проверяют фильтрацию совпадений и независимость token IDs разных предложений; прежние четыре shortlist tests проходят. Для fresh sample без разметки dictionary runner теперь сохраняет `score: null`, чтобы не считать отсутствие gold отсутствием выражений. Первичный приватный технический output с механическими zero-gold метриками сохранён как `first-run-result.json`, они не интерпретируются и не входят в публичный итог.

Приватные запросы, ответы и деревья: ignored `tmp/agent-import-742/fresh-hints-20261019/`. Никаких изменений приложения, БД, коллекций, словаря или прогресса. Лицензионные вопросы DUCAME из предыдущих отчётов остаются открытыми; production adoption не принята.

**Решение по эксперименту:** на этих12 предложениях оснований делать DUCAME обязательным дополнительным этапом не появилось. Не расширяем выборку задним числом ради положительного примера. Возможную пользу на других корпусах, менее сильной модели или near-miss это не исключает, но здесь она не показана.

API output contract опирается на [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses); эта гарантия относится к схеме, а не к правильности лингвистического ответа.
