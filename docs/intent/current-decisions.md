# Текущие решения

Здесь только действующие решения и основания. История рассуждений — в
[архиве обсуждений](../discussions/README.md); статус реализации — в планах/issues.

| Тема | Действующее решение | Основание |
| --- | --- | --- |
| Жизненный цикл Training | Единое правило для всех типов: актуальный прогресс незавершённого run; completed/exhausted не предлагают Continue и не сохраняют запись продолжения. Общая обработка в работе #647, не выпущена. | [Обсуждение](../discussions/2026-10-09-02-training-lifecycle.md) |
| Импорт словаря | Временный staging и одна транзакция; при отсутствии истории — пакетная вставка узлов, при обновлении — сверка изменившихся узлов с сохранением UUID. Полный импорт нужен для нового корпуса/пустой базы, обычная QA использует fixture. | [Обсуждение](../discussions/2026-09-30-01-dictionary-import-staging.md), [ADR-0016](../adr/0016-staged-dictionary-import.md) |
| Документирование | Каждое существенное обсуждение — отдельная датированная запись; новые решения обновляют этот реестр и соответствующие ADR, старые обсуждения сохраняются. | [Обсуждение](../discussions/2026-09-25-02-decision-recording.md), [правила](../discussions/README.md) |
| Слово в контексте | Перевод примера служит подсказкой для вспоминания конкретного значения; обычная reverse-очередь и единый FSRS, ротация примеров без отдельного прогресса. В истории — вариант предъявления и открытие подсказки. Оценок старого режима нет, перенос прогресса не требуется. Alignment/подсветка вне MVP. | [Модель](../discussions/2026-09-25-03-word-in-context.md), [переход](../discussions/2026-09-25-04-word-context-transition.md), [ADR-0015](../adr/0015-word-in-context-shared-reverse-state.md) |
| Подготовка переводов | Готовить одну следующую карточку через общий API/кеш без учебных действий; первой показывать состояние подготовки. | [Обсуждение](../discussions/2026-09-25-01-sentence-queue.md), [ADR-0014](../adr/0014-sentence-queue-and-preparation.md) |
| Порядок работ #333 | Контракт ordinary reverse и переход старых сессий → ротация/метаданные → общий UI и подготовка переводов → проверки и выпуск. Оптимизация запуска и первая предзагрузка уже выпущены; новая модель ещё не реализована. | [Обсуждение](../discussions/2026-09-25-03-word-in-context.md), [план](../exec-plans/active/issue-333-sentence-user-release.md) |

| Визуальная система UI | Принято направление D + Lavender, Inter/Newsreader и прежние цветовые засечки review-кнопок. Согласованные компоненты перенесены в рабочие адаптеры за флагами; окончательная приёмка и включение выпуска ещё не завершены. Статус проверок — [план #407](../exec-plans/407-integration-readiness.md). | [ADR-0016](../adr/0016-lavender-ui-and-training-card-continuity.md), [история](../discussions/2026-09-26-01-builder-lavender-library.md) |

| Кнопки Library | В прототипе приняты Learn во всю ширину, тёмные тональные подписи оценок и меню через многоточие. Метка в рамке и близкий счётчик пока предложения. | [Обсуждение](../discussions/2026-09-28-02-library-frame-exposure.md) |

| Чтение Library | Выбран Literary example. Список прокручивается со страницей, поиск закрепляется, статья имеет независимую прокрутку с передачей странице на границе. Реализовано в прототипе. | [Обсуждение](../discussions/2026-09-28-05-library-scrolling.md) |

| Вложенный блок Library | Принят Literary example, Explanation / Example внутри soft block без линий, текст с отступом 8 px. Текущий экран предварительно одобрен; Statistics проходит следующее согласование. | [Обсуждение](../discussions/2026-09-28-07-library-approved-statistics.md) |

| Пауза учебного материала | Пауза языка/выключение словаря ограничивает новые запуски и выбор материала; начатую тренировку можно продолжить, прогресс сохраняется. Проверки прав доступа действуют отдельно. Серверное правило реализовано в #407 с фиксацией материала начатой сессии. | [Ответ пользователя, #407](../discussions/2026-09-30-02-paused-training-material.md) |

| Настройки учебного материала | Порядок/пауза языков и выключенные словари хранятся в аккаунте отдельно от ACL и сессий; запись с проверкой ревизии защищает изменения между устройствами. Контракт хранения, правила новых запусков и рабочие Settings подключены в #407; подробности проверки — [план](../exec-plans/407-integration-readiness.md). | [ADR-0017](../adr/0017-account-material-preferences.md) |

| История тренировок | Последние 50 принятых действий всех семейств, без ограничения в 24 часа; доступ к словарю и изоляция пользователя сохраняются. | [Решение](../discussions/2026-10-01-01-recent-training-history.md) |

| Known / Exclude | Known — выбранное значение и направление; Exclude — выбранное значение в обоих обычных направлениях во всех тренировках слов пользователя. Learn знакомит со значением один раз и включает оба направления; Known также сохраняет знакомство без фиктивной оценки. Возврат в обучение снимает обе отметки Known и исключение, сохраняя историю. Идиомы, предложения и аудио независимы; прогресс не переписывается. Exclude внедрён в 192; направленный Known — в 193. Исторические парные Known сохраняют свою область и отмену. | [Уточнённое решение владельца](meaning-learning-progress.md) |

| Публикация словарей | Общие опубликованные словари можно искать и просматривать без Premium; закрытые словари требуют явного доступа пользователя/группы, а Premium или tester tier сами по себе доступ не дают. Чтение и тренировочная eligibility остаются отдельными решениями; ссылки и прогресс списков сохраняются при снятии публикации. Просмотр содержимого оператором требует отдельного разрешения и аудита. | [Контракт](./dictionary-publication-access.md), #469/#470 |

| Уборка UI | Удалить старое представление по фактическим потребителям, затем разделять оставшиеся обязанности Setup/Library и Training с characterization-тестами. Сохранить утверждённый UI, настройки и учебные контракты. Исполнение: #610 / #255. Текущий этап ограничен проверками готовности PR #611; дальнейшее дробление Library/Training — отдельно. | [Обсуждение](../discussions/2026-10-07-01-ui-retirement-and-refactor.md), [границы этапа](../discussions/2026-10-08-01-retirement-release-readiness.md) |

| Следующий рефакторинг UI | После опубликованного #611: telemetry finite sessions → Library search lifecycle → Training resume/reconciliation, с characterization, одним координатором и неизменным нормативом1s. Цель #612 ограничена review-ready PR; SQL-оптимизация #413 и merge/deploy отдельно. Реализация начата, не завершена. | [Согласование](../discussions/2026-10-08-02-state-ownership-refactor.md), [план](../exec-plans/active/issue-612-state-ownership.md) |

## PWA launch identity (2026-10-08)

Accepted: Inter 52px regular wordmark with accented nl and three flowing dots, no visible loading subtitle. Launcher icon uses the complete one-line wordmark on graphite at the owner-selected 132px / 500 source size; uncommon Android masks may crop beyond the conservative safe circle. Startup can read a validated cosmetic palette/theme cookie, refreshed only from confirmed profile settings; profile readiness remains authoritative. Native pre-page splash remains platform-controlled and fixed neutral. [Discussion](../discussions/2026-10-08-03-pwa-launch-identity.md), issue #630. Implementation pending release.

## Training front layout (2026-10-08)

Accepted: centre the main prompt independently of instructions; reserve hint space and fade hints without moving the prompt. Shared fronts retain readable overflow for long content. Normal Training button boundaries use the quiet border role, preserving keyboard focus. Implemented in [PR #635](https://github.com/vbalashi/2000nl/pull/635); validation and release evidence are recorded there. [Discussion](../discussions/2026-10-08-04-training-prompt-centering.md), #633.

## Активная карточка в словарной статье (2026-10-09)

Принято: вариант «Статус и подсказка» на месте учебных действий активного
значения. Изменения его учебного состояния выполняются на экране тренировки;
остальные значения сохраняют доступные действия, кроме общих действий над
словом, затрагивающих активную карточку. Реализация: #640.
[Обсуждение](../discussions/2026-10-09-01-active-training-article.md).

| PWA icon revision | Принята фиксированная Lavender, 2000 / nl в две строки, Inter 400; Android maskable с дополнительным отступом 5%. Реализовано в #642, выпуск ожидает проверок. | [Обсуждение](../discussions/2026-10-09-01-lavender-icon.md) |

## Анимация прогресса тренировки (2026-10-10)

Принято: в Appearance выбрать «Выключена», «Точки» или «Волна»; по умолчанию — тихие точки. Индикатор расположен между компактной шапкой и карточкой, с отдельными отступами для двух вариантов; остаётся на месте при свайпе карточки. Выключенный режим и бесконечная сессия показывают только счётчик и не резервируют место под графику. Решение заменяет кромку из обсуждения 9 октября. [Обсуждение](../discussions/2026-10-10-01-training-progress-animation.md), #644 / PR #654.
## Training startup recovery (2026-10-09)

Accepted: prerequisite loading and retry share the branded logo/dots surface; actual failures retain actionable retry without the obsolete framed panel. Pending work must not become a fabricated failure. Original Pixel request failure remains unconfirmed. [Discussion](../discussions/2026-10-09-02-startup-recovery.md), #575. Implemented in the issue checkout; release pending.

## Полнота переводов (2026-10-10)

Принято на текущий спринт: перевод самостоятельного headword на обороте
идиомы → полезные эквиваленты одного значения → факультативный дословный
перевод идиом → переводы синонимов/антонимов. Варианты разделяются лёгкой
средней точкой `·`. Этап1 реализован в PR#656; проверка и выпуск
отслеживаются в #655. Промпт/модель переводов обновлены в #660;
дословность и переводы связанных слов остаются следующими этапами.
[Обсуждение](../discussions/2026-10-10-01-translation-sprint.md), #655.

## 2026-10-10: Luna 6 dictionary translation profile

Accepted after the fresh100 relative gate: Luna 6 with tuned v5 becomes the dictionary translation default; GPT-4.1 v4 and legacy v1 remain selectable rollback profiles. Model, prompt, settings and cache identity switch together. Evidence, scope and limitations: [discussion](../discussions/2026-10-10-07-luna6-translation-release.md). Operations: [rollout and rollback](../runbooks/dictionary-translation-model-rollout.md). Implementation tracked in #659.
