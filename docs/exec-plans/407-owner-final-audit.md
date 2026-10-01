# #407 — итоговая сверка34 замечаний

1 октября2026. Проверенный implementation HEAD `6cf51fcf`; дальнейшие коммиты этого аудита меняют только документацию. Каждый пункт исходной очереди проверен по текущему source, соответствующим tests/SQL и actual UI evidence. Требования исправлений выполнены. Это агентская сверка с референсом, не утверждение, что владелец уже принял внешний вид.

## Проверки текущего состояния

-26 suites /303 tests passed (17:13:43,54.64s), включая route/filter/selection/action/start/resume/chrome/motion/appearance/dialog/localization.
- Typecheck passed. Lint exit0, единственное прежнее предупреждение missing handlePlayAudio dependency в TrainingSenseCardV2Session618.
- library_initial_browse.sql passed:14,449 groups, filters/pages/scope/ACL/legacy lookup; transaction ROLLBACK.
-3100 health ok, database local/contract193 compatible, approved flags true; translationExercises false. Health commit2fa40926 — startup stamp, не implementation HEAD. Source проверен из указанного worktree.
- Browser evidence covers RU/EN/NL, Normal/Extra, Light/Dark, desktop/mobile, including current final matrix shots and per-correction interactions in owner queue. This is the dimensional acceptance scope; no claim of exhaustive testing of every possible data state or screen combination.
- Все снимки сохранены вне временного каталога: `/Users/khrustal/adhoc/2000nl-407-visual-evidence/`. Имена соответствуют owner queue.

## По требованиям

Пути модулей ниже относятся кapps/ui, SQL —db. Подробные source paths/commits/screenshots отдельных этапов: [исходная очередь](407-owner-visual-corrections.md).

|№|Текущий владелец/модуль|Доказательство и результат|
|---|---|---|
|1|TrainingScreen; sessionResumeStore; TrainingSessionChrome/Idiom/Sentence|Подтверждено. Выбранное имя во всех family/start/resume/header; sessionResumeStore9 и commit7/Chrome11 tests.|
|2|AppUtilityNav|Подтверждено. Sun/Moon/Monitor по Light/Dark/System; actual settings/theme matrix, owner callback/disabled сохранены.|
|3|TrainingExcludeAction|Подтверждено. Шеврон только у меню, aria-expanded;6 tests, correction3 browser.|
|4|useTrainingPromptReveal|Подтверждено. Visible arriving copy до видимости real answer;6 tests, correction4 trace100frames blank=[]; reduced motion сохранён.|
|5|articleSurfaces; TrainingDetailsDrawer; DictionarySearchTab|Подтверждено. Прозрачная статья без внешней карточки; actual Library desktop/mobile, correction5 computed border0.|
|6|articleSurfaces|Подтверждено. Номер и статус top-20 над рамкой; correction6 geometry и current actual article.|
|7|senseChrome|Подтверждено. Transparent toggle, corner placement, focus/28px target; correction7 Enter/collapse и current article.|
|8|LibraryCollectionsPicker|Подтверждено. Краткий title/help, плюс открывает форму/focus;4 tests и final-collections-ru; real callbacks/errors retained.|
|9|WordDetailsHeader; PracticePanel|Подтверждено. Только close, accessible dialog label;3 dialog tests и actual mobile article.|
|10|AppFrame.module.css|Подтверждено. Approved border-bottom0; actual header matrix, legacy separator retained.|
|11|DictionarySearchTab; librarySearchScope|Подтверждено. Именованная область только текущей коллекции; correction11 contract/browser,25 grouping tests.|
|12|DictionarySearchTab|Подтверждено. Первичный My dictionary/Add entry убран; copy action/API retained; actual no-query/search UI.|
|13|DictionarySearchTab|Подтверждено. Нет typeQuery в approved toolbar; actual initial results.|
|14|Library route/lookupService; migration194|Подтверждено. Explicit empty string разрешён только first-party Library; alphabetic pages/ACL/filter/count.8 API+25 grouping+SQL rollback current pass.|
|15|AccountLibraryFilters|Подтверждено. Count/loading/error/retry вместо требования запроса;4 tests и final-filters-ru-light-extra.|
|16|NounArticleChoices; nounArticles; selectionService|Подтверждено. Толькоde/het; both/neither normalize no restriction, independent choices.1 choice+38 selection+43 setup tests и correction16 browser.|
|17|DirectionCard; directionExamples; ApprovedTrainingBuilder|Подтверждено. Общий divided renderer, concrete NL/EN samples/fallback/lang tags;4 tests.244px cap,700 two244x200,395 wrap244x200; callbacks unchanged.|
|18|directionExamples; controller; ADR0015|Подтверждено. Конкретная sentence/translation pair; ordinary reverse context contract retained. Separate Translation false runtime gate/hold unchanged.|
|19|locales; builder labels|Подтверждено. RU Идиомы, EN Idioms/NL Uitdrukkingen; localized tests и actual builder views.|
|20|ApprovedTrainingBuilder; libraryFilters.search|Подтверждено. Общий search renderer/styles с prototype;43 setup tests и correction20-23.|
|21|migration147/161; builder activityHelp|Подтверждено. User action history ordinary directions/day/source, все outcomes; expanded explanation/end chevron, selection unchanged.|
|22|ApprovedTrainingBuilder|Подтверждено. Language search только>5, hidden query ignored;43 setup tests и correction22.|
|23|ApprovedTrainingBuilder|Подтверждено. Source search только>5 текущего mode; hidden query ignored/mode clears.43 setup tests и correction20-23.|
|24|statistics.module.css; Statistics activity owner|Подтверждено. No horizontal bar; container threshold63.636em grows with labels, year/2months navigation, accessible days.9 tests и current Normal/Extra desktop/mobile.|
|25|AccountStatistics|Подтверждено. Trailing ChevronRight aria-hidden; history owner unchanged, correction25 open/return и actual matrix.|
|26|StatisticsLanguageTabs; AccountStatistics|Подтверждено. Single language label always, multiple tabs/overflow preserved;3 localization tests/current screenshots.|
|27|material-progress route; AccountStatistics; StatisticsScope|Подтверждено. Authenticated curated slug; only verified matching vandale-all mirror omitted, dictionary/2k typed labels, personal group.5 API tests failclosed; actual catalog18163/4031.|
|28|StatisticsMaterial|Подтверждено. Redundant legend removed; total/progress/hint retained.3 localization tests/current material browser evidence.|
|29|ApprovedSettingsDestination; prototype Settings; package/API audit|Подтверждено. Исследование выполнено: billing integration отсутствует, prototype actions disabled; entitlement не paid status. Никаких фиктивных платежей. Отдельная future feature, не задача34 исправлений.|
|30|ReadingPreferencesProvider; ApprovedTextSizeSection|Подтверждено. Automatic device detection; approved ignores legacy override; no manual selector; account profiles retained.6 ReadingPreferences tests/current settings matrix.|
|31|textPreferences.module.css|Подтверждено. Compact right selector/wrapping; labels/pressed/save/retry/disabled retained, actual desktop/mobile.|
|32|ApprovedTextSizeSection|Подтверждено. Shared ProductionArticleReading/headword/content renderer + frame;8 sharedArticle tests и full NL Extra mobile preview.|
|33|AppFrame|Подтверждено. Logo calls onNavigate training, navigationDisabled retained;9 AppFrame tests и actual navigation.|
|34|StartupLogoScreen; appearance provider; bootstrap shell|Подтверждено. Neutral logo/status, no indigo/card/glow, account palette awaited before UI, fade/reduced-motion/retry.4 startup+7 appearance tests; correction34 browser evidence.|

## Границы результата

Scheduling/RPC owners не перемещены в UI. Единственный DB change этой очереди194 — read-only private Library browse candidate path; изменения нет в Platform generic lookup, права/ACL сохранены и проверены. Новый slug projection read-only через authenticated RLS. Учебные действия, start/save ownership и resume identities сохранены.

Визуальные поправки выполнены по очереди и закоммичены; повторные замечания17/18 и найденные итоговым audit clipping/calendar исправлены отдельными commits. Биллинг29 требовал исследования: реального провайдера нет, это объяснено; разработка оплаты не входит в этот результат. Translation rollout hold не снят. Production deployment/migration manifest rollout, push, merge не выполнялись и не являются этим локальным заданием.

Оригинальные RU/Normal/System/Graphite и viewport восстановлены; canonical3100 сохранён. Прежние записи «audit pending» в queue/readiness — история этапов, заменены этим итоговым вердиктом. Обязательных незавершённых пунктов в34-item queue нет.
