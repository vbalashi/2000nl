# Извлечение выражений: сравнение методов

2026-10-18, внешний пилот #742. Исследование выполнено по прямому поручению
владельца: разные запросы, reasoning, модели, леммы/разбор и дополнительные
проверки. Production, коллекции и словарные статьи в этом инкременте не менялись.

Наиболее полезным оказался не простой veto, а **объединение пересекающихся
предложений кодом → отдельное решение агента о границах и словарной форме**.
На маленькой выборке этот проход сохранил все 23 обязательных выражения с точным
лексическим ядром. Это не означает полноту всех выражений видео или 100% accuracy.

## Метод и ограничения оценки

До comparative calls заморожены 32 предложения из трёх ранее полученных видео:
NOS author captions, Easy Dutch/LUBACH собственный AudioFilms ASR. Эталон:
23 обязательных лексических ядра, семь optional/borderline units, обычные фразы
и шум ASR. 16 familiar challenge и 16 extra cases. Источники уже изучались;
это operator-labelled development set, не blind held-out/native-speaker gold.

Лексическое ядро — неизменяемые token IDs, в том числе разрывные. Переменные
объекты/местоимения исключаются, фиксированные части сохраняются. Например,
разрывный глагол не превращается в один непрерывный quote с посторонними словами.
Контекст, sourceHash и char offsets остаются привязаны к исходному тексту.

Exact-core сравнивает наборы компонентов один к одному. Optional exact matches
нейтральны. Relaxed score использует IoU>=0.5, **не официальный partial metric
PARSEME**. Канонический заголовок оценивается отдельно: exact-string совпадение
не равно семантической правильности. Эталон не передавался моделям.

[Протокол и hashes](MWE-STUDY-PROTOCOL-20261018.md),
[машиночитаемый результат](MWE-STUDY-RESULT-20261018.json),
[исследование первичных источников](MWE-METHODS-RESEARCH-20261018.md).

## Сравнение извлечения

Колонка «вне эталона» включает ошибки границ, спорные и неразмеченные полезные
фразы. Это **не автоматически число лингвистических ошибок**. F1 ниже —
согласие с текущим закрытым эталоном, не оценка product precision.

| Вариант | Точные ядра / 23 | Вне эталона | Exact F1 | Relaxed F1 |
| --- | ---: | ---: | ---: | ---: |
| spaCy small + два текущих правила | 7 | 25 | .255 | .509 |
| spaCy medium + те же правила | 6 | 27 | .214 | .464 |
| Stanza Alpino + те же правила | 5 | 28 | .179 | .429 |
| Luna low, общий запрос | 17 | 10 | .680 | .920 |
| Luna low, перечислены категории | 17 | 10 | .680 | .880 |
| Luna high, те же категории | 20 | 7 | .800 | .920 |
| Sol low, те же категории | 21 | 10 | .778 | .852 |
| Luna low + соседние предложения | 17 | 12 | .654 | .846 |
| Luna low + подсказки spaCy small | 17 | 11 | .667 | .902 |
| Два специалиста Luna, union | 19 | 15 | .667 | .772 |
| Union шести общих вариантов и двух специалистов | 23 | 37 | .554 | .554 |
| Тот же union после отдельного Sol veto | 23 | 23 | .667 | .667 |
| Группировка вариантов + Sol с исправлением границ | 23 | 5 | .902 | .902 |

Parser baselines используют только `compound:prt` и связь ADP→head→VERB.
Они не обучены определять весь набор идиом/коллокаций, не используют MWE-lexicon.
Поэтому таблица сравнивает **нашу текущую стратегию candidate rules**, а не
доказывает превосходство LLM над специализированными MWE-моделями. Последние
во внешних исследованиях иногда побеждают LLM; см. primary-source research.

Наблюдения:

- Категории в одном запросе не улучшили exact score. Это не доказательство
  бесполезности категорий вообще; taxonomy и отдельные специалисты — разные методы.
- Higher reasoning помог границам на этом наборе; более дорогая Sol нашла на
  одно точное ядро больше, но дала больше внеэталонных предложений.
- Соседи и parser hints автоматически качества не добавили. Нужна адресная
  маршрутизация контекста, а не увеличение каждого запроса.
- Два специалиста подняли required recall с17 до19, но добавили варианты/шум.
  При union по core нельзя считать разные границы независимыми находками.
- Обычный veto уменьшает лишние варианты, но не объединяет их и не исправляет
  границы. Для этого нужен отдельный контракт adjudication.

Повтор Luna taxonomy low: оба запуска дали28 cores и одинаковый exact F1=.680,
но общих cores только19, symmetric difference18. Один aggregate score скрывает
значительную вариативность. Это два запуска, не статистическая оценка стабильности.

## Что именно делает согласование

Код объединяет cores одного предложения в connected components при IoU>=0.5;
получилась41группа из62уникальных core proposals. Sol получает исходные токены
и варианты группы без названий моделей/их объяснений. Он может выбрать/исправить
одну версию, отклонить группу или оставить uncertain. Generic copulas/objects и
обычная negation не входят в core; source tokens нельзя выдумывать.

На выходе29units:23 точных обязательных, один neutral optional и пять вне
исходного эталона. Важное post-hoc наблюдение, **эталон v1 не переписывался**:
два из пяти отличаются границами optional коллокаций (`compliment geven`,
`duimpje omhoog geven`), три — discourse proposals (`best wel`, `nou, nou, nou`,
`zeg maar`). По крайней мере часть требует дополнения разметки, а не удаления
из учебного материала. Они не объявлены автоматически approved.

Агент оставил uncertain испорченное `bij macht` вместо уверенного восстановления
`bij machte`; это подходящий сигнал для проверки аудио. Объединение перекрытий
также может склеить разные вложенные units, поэтому one-unit-per-group —
ограничение эксперимента. Native-speaker annotation нужна для такой политики.

Согласование видело **union восьми вариантов**, то есть более богатый вход,
чем отдельные модели. Это не однофакторное доказательство преимущества промпта
или готовый дешёвый pipeline из одного extractor и одного verifier. Следующий
transfer должен проверить сокращённый состав на новых источниках.

## Леммы и части речи

Отдельно заморожены12известных трудных dictionary-oriented случаев. Full-source
spaCy small из первого пилота сравнивался со свежим разбором отдельных предложений,
medium, Stanza и LLM. Для adjective/adverb citation cases POS alternatives
заданы заранее. Это не general Dutch UD accuracy.

| Вариант | Нужная словарная лемма / 12 | Допустимый POS / 12 |
| --- | ---: | ---: |
| spaCy small, исходный полный текст | 3 | 1 |
| spaCy small, отдельное предложение | 3 | 1 |
| spaCy medium, отдельное предложение | 7 | 8 |
| Stanza Alpino, отдельное предложение | 8 | 9 |
| Luna low | 12 | 12 |
| Luna high | 11 | 12 |
| Sol low | 12 | 12 |

Luna high дала `vreemd` вместо noun citation `vreemde` для `vreemden`. Это
конкретный пример, почему effort нельзя увеличивать без измерения результата.
В этой задаче medium/Stanza полезнее small, хотя MWE-rule scores выше этого
не показывали. Lemma/POS и извлечение выражений — разные оси качества.

Cold load / обработка32предложений в отдельных процессах CPU:
sm .93/.055s, md1.08/.054s, Stanza5.40/.538s. Peak RSS примерно156/402/993MB.
Это локальные единичные измерения, без production API/SQL latency claim;
download/install не включены. Версии: spaCy3.8.11, Dutch models3.8.0,
Stanza1.15.0, Torch2.14.1; Alpino package, CPU4threads.

## Проверка конкретных словарных значений

Дополнительно заморожены12старых разногласий, одно помечено uncertain заранее.
На11certain operator cases: Luna low10/11 (ложный veto `bekend1`), Luna high11/11,
Sol low11/11; Sol с альтернативными статьями тоже11/11. Incremental benefit
альтернатив на этом regression set не показан. Prompt учитывает известные
ошибки предыдущего пилота, поэтому это supervised regression, не generalization.
Никакие решения этого прохода в пользовательские коллекции не применялись.

## Полнота ответа — отдельная проверка

Первый Sol union-review вернул валидный JSON только по3из16units, HTTP200,
response status completed. Это не transport failure и не нехватка8192tokens:
usage output229tokens. Код обнаружил неполный набор IDs. Исходный ответ
сохранён; три результата использованы, оставшиеся59units обработаны отдельно
порциями≤8 с JSON Schema min/max cardinality и повторной проверкой IDs.
Это изменяет одновременно размер batch и schema constraint; не утверждаем,
что установлена единственная причина сбоя. Transport retries0; все новые
запросы входят в общий ledger. Отдельная min/max card защита вошла в тесты.

Устранена Pydantic-коллизия поля `register` с inherited ABC attribute: теперь
внутреннее имя с alias. Strict wire schema структурно идентична сохранённой
схеме первого запроса; старые frozen checkpoints повторно прочитаны без новых
model calls. Исходные ответы и сырой input hash не переписывались.

## Стоимость и источники

62новых model HTTP calls, все HTTP200 и usage известен; token total discrepancies0.
Deployment resource `dilumio-01-resource`, Sweden Central, GlobalStandard,
Microsoft Azure Sponsorship. Window requests:
2026-10-18 21:32:17.368–21:43:29.983 UTC (23:32–23:43 Europe/Amsterdam).
Это весь research matrix со вспомогательными проверками, **не цена одного видео**.

| Deployment | Calls | Input / output tokens | Published estimate USD |
| --- | ---: | ---: | ---: |
| gpt-6-luna (2026-09-22) | 38 | 70824 / 35472 | .02586628 |
| gpt-6.1-sol (2026-09-29) | 24 | 44178 / 10530 | .21490100 |
| Всего | 62 | 115002 / 46002 | **.24076728** |

По всем инкрементам пилота216calls, cumulative estimate$0.366818605.
Published list estimate, не invoice; собственный CPU/память/хранение/ASR не
монетизированы. Cache read/write — непересекающиеся части input, reasoning
входит в output. Luna low taxonomy для32cases стоила$.0023782, high$.0059087,
Sol low taxonomy$.036714. Median batch HTTP latency соответственно6.46/16.77/11.80s;
это восемь предложений за запрос и всего четыре наблюдения на условие.

Ставки за1M short-context tokens: Luna ordinary/cache-read/cache-write/output
.10/.01/.125/.50; Sol2/.10/2.50/10. Primary sources:
[Microsoft Luna launch](https://azure.microsoft.com/en-us/blog/gpt-6-astra-sol-and-luna-for-production-agents-in-microsoft-foundry/),
[Microsoft Sol launch](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/introducing-gpt-6-1-sol-in-microsoft-foundry-advanced-intelligence-optimized-for/4560811).
Официальная pricing page показывала placeholders; Sol table получена из
embedded body официальной статьи. OpenAI direct prices не подменяли Azure rates.

## Что брать в следующий пилот

Предлагаемый поток: local parse для структуры → ограниченный extractor с
source-token IDs → code dedup/overlap groups → адресное согласование спорных
границ → dictionary lookup по canonical/form и существующим lexical IDs →
проверка конкретного sense. ASR uncertainty уходит на короткую аудиопроверку,
а не на уверенную генерацию статьи. Model agreement не считается gold.

Следующие приоритеты:

1. Новый источник и независимая Dutch annotation, чтобы проверить сокращённый
   состав extractor/reconciler без выбора победителя на тех же32предложениях.
2. Lexicon-backed DUCAME/MWE-Finder / DuELME и richer UD patterns как отдельный
   baseline. Сейчас они **исследованы, не запущены**; wrapper/resource licenses
   нужно разрешить отдельно. MWE-Finder поддерживает разрывность/вариацию.
3. Нормализация headings через словарный lookup, а не exact-string совпадение;
   related headword links/части выражения по-прежнему отдельный контракт.
4. Отдельные usefulness/register labels: learner collocations, discourse formulas
   и slang не обязаны совпадать со строгой лингвистической категорией MWE.
   Статистические коллокации требуют достаточно большого допустимого корпуса;
   три ролика не дают надёжной association statistics.

38focused tests прошли. Private evidence и raw sources сохранены в
`tmp/agent-import-742/mwe-study-20261018`; checkout742 остаётся evidence-owning.
No merge/release/runtime integration; PR748 остаётся draft research.
