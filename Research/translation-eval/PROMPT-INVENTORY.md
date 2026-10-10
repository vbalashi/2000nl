# Промпты и накопленный опыт: inventory 2026-10-10

## Переводы в текущем runtime

| Семейство | Где находится | Что делает и где ограничение |
| --- | --- | --- |
| Dictionary meaning V1 | `apps/ui/lib/translation/prompts/openai_dictionary_meaning_{system,user}_v1.txt` | Exact sense → primaryText, alternativeTexts, baseText, note, contentTranslations. Промпт не менялся по существу с sense-aware artifacts. Hash `109cf135…`. |
| Selected fragment / contextual V1 | `openai_translation_system_v1.txt`, `openai_translation_user_instructions_v1.txt` | Массив contextual translations, literalTranslations без контекста и comment. Это другой контракт; literal не означает обязательное буквальное раскрытие идиомы. |
| Generic Gemini | `apps/ui/lib/translation/geminiTranslator.ts`, buildPrompt | Перевод aligned strings; нет словарного structured equivalents prompt. |
| DeepL и generic adapter | `deeplTranslator.ts`, `dictionaryMeaningTranslationService.ts` | Возвращают по одному переводу input string. Adapter детерминированно ставит alternativeTexts: []; не генерирует эквиваленты. |
| Fallback OpenAI → DeepL | `openaiTranslator.ts`, coordinator | Generic результат сохраняет пустые альтернативы. Реально used provider и fallback metadata надо проверять отдельно от выбранного provider. |
| Старый eval CLI | `apps/ui/scripts/eval-translation-prompt.ts`, translationEvalCases/Harness | Exact-meaning и fragment probes; executable primary-sense checks есть лишь у части cases. Автоматический LLM judge в текущем TS runner не вызывается. Старые описания min-score/judge шире фактической реализации. |

`literalTranslations` fragment API, `baseText` слова и будущий буквальный перевод
идиомы — три разных задачи. Не объединять их одним неясным полем.

## Исторические переводы

- `adb048c6`: contextual/selected text translation с note и POS. Структурных
  alternatives тогда не было; один string мог содержать больше одного эквивалента.
- `42154692` / `719d5381`: exact-meaning artifact и нынешние meaning prompts.
- `b359d58e`: границы freshness и разделение fingerprints разных контрактов.
- `854e75fa` / issue #196: `.txt` prompts не попадали в Docker image; loader
  молча возвращал пустое содержимое. Hash пустой пары — `316deeb…`.
  После fail-closed загрузчика и packaging исправления правильное значение
  typisch подтверждено шестью live runs. Это был delivery-дефект, не дефект
  формулировок. Историческую запись и evidence не переписываем.
- В read-only кеше curated system/public dictionaries: current-hash ordinary
  RU 822 rows / 2 с alternatives, EN 231 / 1; empty-prompt-hash ordinary RU
  64 / 60, EN 10 / 10. Это разные исторические выборки, а не контролируемый A/B.
  Значения с idiom-only исключены из сравнения частоты headword alternatives.
  Безопасная агрегированная выгрузка: `evidence/cache-inventory-2026-10-10.json`.

## Генерация статей: что изучено, что переносим

1. **Issue #143, prompt tournament A–L.** Версионированные промпты в
   `packages/ingestion/lexicography_eval/prompts/`; plan —
   `docs/exec-plans/active/issue-143-lexicography-prompt-eval.md`.
   Важны exact unit/sense ownership, hard gates перед preference score,
   frozen development/validation splits, сохранение слабых challengers и
   stopping rule. Prompt K в том пилоте выбран по отдельной validation;
   результат не переносится автоматически на перевод.
2. **Текущее #603 article pipeline.** Read-only изучены README, generate/review,
   repair, editorial-review/revise, granularity prompts и отчёты протокола.
   Исходный checkout `.worktrees/603-corpus-research`, observed commit
   `65e54a720fbe258acf70c7101f75238eaa3aceda` (он активен и может двигаться).
   `generate.txt` SHA256 `eda4536e859841f821e7ed74a81e212508926a8772f1d992cb8a21028c96bbed`.
   Генератор сейчас явно НЕ создаёт переводы; optional enrichment отделён от core.
3. **Granularity experiment 2026-10-09.** Более короткий inventory не равен
   лучшему: попытка объединения теряла смыслы/ownership. Переносимый вывод:
   больше alternatives тоже не равно лучше; проверять каждый вариант и поля,
   которые новый prompt мог ухудшить. Не сравнивать свежую генерацию одного
   arm с уже отредактированным результатом другого.
4. **Editorial protocol failures.** JSON-валидность не гарантирует правильные
   semantic references. Требуются hashes exact inputs/results, закрытые коды,
   сохранение неуспешных ответов и явное устранение замечаний. Model review
   не объявляется human approval.

Реализация article generation, корпус, принятые статьи, локальные исследовательские
артефакты и её budgets не копировались и не изменялись. Заимствованы методические
принципы; translation runs, cases и decisions принадлежат только #657.

## Проверенный путь alternatives

OpenAI parser → structured artifact → coordinator cache update → JSON storage
representation → safe overlay → Platform V2 translation → Training/Library model
→ shared answer header. `translationAlternativesPipeline.test.tsx` проходит этот
путь с двумя вариантами и проверяет видимый `говорить · разговаривать · беседовать`.
Существующие route tests также проверяют stored overlay. Это mocked persistence
seam, а не заявленный end-to-end browser/production test.

Для текущего наблюдения основная причина воспроизведена ДО хранения: GPT-4.1
на v1 выдаёт [] на всех 12 development fixtures в двух свежих сравнениях.
Generic fallback и старый кеш — дополнительные отдельные причины одиночного
перевода, но не объясняют этот controlled v1 результат.
