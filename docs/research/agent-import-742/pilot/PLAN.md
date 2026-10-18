# Внешний пилот YouTube → учебная коллекция

Дата: 2026-10-18. Owning #742/#747, draft PR#748. Статус: план пилота по поручению
владельца; приложение не менять. Source: https://www.youtube.com/watch?v=8_WR5b2FJfY .
Название, длительность и наличие Dutch tracks ещё не подтверждены. Web fetch видео
и oEmbed не сработал; это не доказательство недоступности субтитров в AudioFilms.
Не обещать, что видео часовое. Installed yt-dlp найден, provider код прочитан,
запуск извлечения и платные model/provider вызовы на этом checkpoint не выполнялись.

## Принятые поправки владельца

1. Отдельная работа подготовки входа: вернуть structured candidate+context, затем
   отдельный dictionary lookup/resolution. LLM не должен смешивать extraction,
   смысловой подбор и запись в одном непрозрачном ответе.
2. Mixed list может быть NL/FR/RU/EN и неструктурированным. Target language берётся
   из явной задачи/dictionary context; active learning language — подсказка, UI locale
   не authority. Если направление неоднозначно или конфликтует — один вопрос до
   extraction. Не переводить весь иностранный материал в Dutch по умолчанию.
3. Known не фильтрует collection membership. Collection представляет материал видео,
   пригодный и для другого ученика. Текущие Known/прочие learning eligibility остаются
   персональными scheduler filters, без новой скрытой смены их semantics.
4. Noise policy отдельна от Known и frequency. Удалять non-speech/punctuation/артефакты;
   standalone function words можно исключать по согласованным правилам, но token stream
   сохранять полностью до phrase extraction. Не считать любое частое слово шумом.
5. Нужны воспроизводимые замеры и отдельная проработка каждого этапа до integration.

## Этапы и точки совместного просмотра

| Этап | Вход → проверяемый результат | Что решить/замерить |
| --- | --- | --- |
| 0. Freeze источника | video ID → track metadata, pinned raw captions, hash, retrieval receipt | Dutch actual language, manual/auto, длительность, permissions/retention; no paid fallback |
| 1. Source preparation | cues или mixed list → sentences/rows + offsets/context mappings | rolling captions dedup, sentence boundaries, язык/направление; source text не переписывать |
| 2. Candidate packet | prepared text → surface, lemma proposals, kind, occurrences, context evidence | deterministic subtitle baseline против LLM list extraction; source-faithful context |
| 3. Phrase analysis | полный token stream + dictionary inventory → contiguous/discontinuous candidates | verb+preposition vs particle, library/rule/dictionary coverage, ложные срабатывания |
| 4. Batch lookup | candidates → existing entry/sense shortlist, misses и evidence hits | batch sizes, bounded concurrency, latency/round trips/pagination/private scopes |
| 5. Sense resolution | shortlist+context → selected exact IDs и reasons | no-context first sense, context one/multiple, mismatch и ambiguity; ручная оценка |
| 6. Collection preview | selected IDs → local manifest + added/dedup/unresolved/excluded | unique IDs, Known сохранены, список оснований исключения; без пользовательских mutations |
| 7. Agent остатки | bounded unresolved subset → targeted search/refinement/personal drafts | incremental benefit, calls/tokens/cost/time; без corpus pipeline по умолчанию |
| 8. Failure/resume | saved checkpoints → same outputs без повторной оплаты/эффектов | kill/restart, timeout, partial provider response, cancellation, operation identity |
| 9. Server mapping | measured stages → proposed functions/jobs/resources | CPU/RAM/cold start/model residency, storage, limits, queue scheduling; no deployment |

Каждый этап заканчивается отчётом и просмотром примеров. Не ждать весь pipeline,
чтобы заметить ошибку extraction. Первый фактический run: этап0, затем небольшой
фрагмент до этап6; после исправлений — всё видео. Дополнительный mixed-list fixture
обязателен: субтитры не проверяют школьный неструктурированный ввод. Synthetic fixture
так и обозначается; не выдавать выдуманный список за исходный список владельца.

## Порядок lemma и context

Для subtitles: sentence/context mapping → tokenization/morphology/lemma proposals →
phrase candidates → grouped lookup. Для mixed list: target-language resolution →
agent structural extraction original spans+teacher gloss/context → local morphology
или optional lemma tool → validated candidate packet → lookup. Не требовать LLM
сразу угадать единственную lemma: сохранить варианты с POS/uncertainty и provenance.
Сначала искать исходную форму и проверенные варианты; lemma не стирает expression.

Контекст — исходное предложение, при необходимости соседние предложения или teacher
translation/definition. Выдуманный пример не заменяет отсутствующий source context.
Offsets и quote проверяются against source; free-form комментарий агента отдельно.
Для discontinuous expression — массив spans/token IDs, не выдуманный contiguous span.

Пример packet (синтетический, не из видео):

```json
{
  "schemaVersion": "candidate-packet-v1",
  "sourceRevision": "sha256:...",
  "targetLanguage": "nl",
  "candidateId": "c17",
  "surface": "vertrouw",
  "lemmaCandidates": [{"lemma": "vertrouwen", "pos": "VERB", "method": "parser"}],
  "kind": "word",
  "occurrences": [{
    "sentenceId": "s8",
    "targetSpans": [{"start": 3, "end": 11}],
    "context": {"kind": "source_sentence", "text": "Ik vertrouw op je.", "language": "nl"},
    "location": {"cueIds": [8], "startMs": 1000, "endMs": 2500}
  }],
  "relatedCandidateIds": ["expression-vertrouwen-op"]
}
```

Teacher gloss сохраняется с kind=teacher_gloss и своим language, даже если не Dutch.
JSON schema/offset validation не подтверждает лингвистическую правильность. Dedup
lookup queries по normalized form/language/scope, а occurrences/senses не схлопывать.

## Что реально детерминировано

String/token/PhraseMatcher и правила над dictionary inventory воспроизводимы, но
покрывают только заданные patterns. Lemmatizer/parser обычно включает обученную
статистическую модель: frozen version делает run воспроизводимым, но не истинным.
DependencyMatcher добавляет правила над возможными ошибками parser. Verb particle
compound:prt и prepositional complement не одно и то же; близость глагола и предлога
не доказывает fixed construction/idiom. Сравнить словарный matcher и parser rules
на одних размеченных случаях, не объявлять библиотеку решением всей семантики.
[Исследование библиотек](../nlp-options.md) уточнит выбор по primary docs.

## Packet и batch контракт

Предлагаемые scripts, пока НЕ реализованы:
`00_capture`, `01_prepare`, `02_extract`, `03_match_phrases`, `04_lookup`,
`05_resolve`, `06_preview`, `07_agent_residuals`, `08_report`.
Одна CLI stage/run/resume, общая config; не отдельный script на каждое слово.
Production function boundaries получатся после измерений, не заранее копией CLI.

Batch lookup request: request ID, target language, immutable dictionary scope,
items[{candidateId, surface, lemmaCandidates, kind}], cursor. Response по каждому
candidateId: exact/form/lemma targets, sense ordering, complete/paginated/error,
separate example evidence. Не терять один item из-за failure другого; capped results
не выдавать за отсутствие значения. Чтение entry groups/значений по доступам пользователя.
Нет userId из model authority. Legacy single-item API vs dedicated batch адаптер
сравниваются отдельно на snapshot/local fixtures; никакого нагрузочного production
прогона. Пока не выбран словарный snapshot и authorised scope — lookup stage disabled.

Agent calls принимают небольшие packets с contexts и shortlist, не полное видео.
Общий prompt для пакета экономит повторения, но oversized batches ухудшают isolation/
retry и полноту. Проверить несколько размеров при зафиксированных total caps;
CPU worker и remote model concurrency измерять раздельно. Предлагаемые варианты
для benchmark: lookup batches16/64/128; model packets5/10, только после budget freeze.
Это тестовые конфигурации, не установленный optimum/production SLA.

## Измерения

Run manifest фиксирует git/code/schema/prompt/library/model versions, host CPU/RAM,
source hash/track/lang, scope, policy, execution mode и budget. Каждый stage сохраняет
input/output hash, counts, wall/CPU time, peak RSS, bytes, errors и cache cold/warm.
Для LLM — request IDs, full assembled request hash, roles/version, attempts, input/
output/cached tokens, known/unknown usage, pricing snapshot/date и conservative reserve.
Для subtitles отдельно retrieval/provider cost; latency pipeline не равна sum HTTP
при parallelism. Отсутствующий usage не zero. Нет обещаний цены/времени до run.

Coverage metrics: raw tokens, unique forms/lemma candidates, phrase candidates,
existing matches, unresolved senses, misses, exclusions by reason, selected unique
entry IDs; Known count отдельно и included. Ручной gold slice берём до настройки
правил: случайные предложения плюс отдельный сложный набор для verb-preposition,
separable verbs, polysemy, noncontiguous expressions и caption noise. Публикуем
ошибки/precision/recall с denominators и unknown, не один процент по удобным примерам.
Сложный набор не выдаём за репрезентативную частоту во всём видео.

CPU-only baseline без LLM: first small model vs более тяжёлый вариант только при
содержательной пользе. Фиксировать install/model footprint, startup/warm throughput,
workers/RSS и storage/job, оценить 1/несколько concurrent jobs по измерениям.
Позднее цены считать из measured token workload и current pinned tariff, не из
research2735 или исторической средней цены готовой статьи.

## Изоляция и resume

Execution artifacts в ignored pilot run directory собственной742 worktree либо
отдельной согласованной storage папке, не в603 и не в app DB. Коммитить plan/config/
схемы/санитизированный отчёт, не raw captions/private exports/provider secrets.
Перед первым run задать artifact retention и dictionary snapshot rights.
Journal можно начать с локального SQLite + immutable JSONL/JSON stage artifacts;
он моделирует durable server task, не объявляет готовой production queue.

Одно intentional operation ID, stage checkpoints, per-request receipt, lease/lock,
unknown/in-flight reconciliation. Повторный run не повторяет успешную генерацию.
Отдельная возможность dry-run preview без любых writes. Known не удалять из результата;
никаких training actions/progress resets. Платные providers/LLM запрещены по умолчанию,
отсутствие Dutch captions не запускает ASR/translation или paid fallback автоматически.

## Следующая совместная точка

Проработать этап0: доступный Dutch track, metadata и безопасный pinned snapshot этого
видео через AudioFilms provider. Затем показать 10–20 реальных packet примеров и
отдельный mixed-list fixture. Именно эти артефакты дадут основание выбрать NLP и
batch/sense-resolution contracts. Не встраивать pilot в приложение до этого review.
