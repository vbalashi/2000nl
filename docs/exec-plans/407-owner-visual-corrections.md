# #407 — очередь исправлений визуальной приёмки

2026-10-01. Все33 browser comments и замечание загрузки сохранены под исходными номерами. Рабочий вид не принят: прежние зелёные технические проверки не доказывают сходство с прототипом. Исправления последовательно, узкая проверка и коммит каждого завершённого этапа.

Порядок:3 (маленький пропуск),1 (название/resume),4 (reveal),5–10 (статья/панели),33/2/34 (хедер/загрузка),11–15 (Library),16–23 (Builder),24–28 (Statistics),29–32 (Settings). Пункты11/18/21/29 сначала исследовать/объяснить, не удалять поведение молча.

- [x] **1.** Название тренировки в сессии; передавать выбранное имя, сохранять при resume, все семейства.
- [x] **2.** Кнопка темы как в прототипе; сохранить Light/Dark/System владельца.
- [x] **3.** Шеврон Exclude при раскрываемом меню; состояние открытия.
- [x] **4.** Убрать мигание примеров после переноса prompt при reveal; reduced motion.
- [x] **5.** Фон полного слова без лишней внешней карточки/рамки, как flat референс.
- [x] **6.** Номер/состояние значения над карточкой, не в разрыве рамки.
- [x] **7.** Шеврон значения без фоновой кнопки, ближе к правому верхнему углу.
- [x] **8.** Коллекции: простой заголовок/подсказка, плюс создания вместо перегруженной формы; сохранить реальные действия/ошибки.
- [x] **9.** Убрать видимый заголовок Сведения о слове; сохранить accessible dialog name/закрытие.
- [x] **10.** Убрать горизонтальный разделитель хедера approved UI.
- [x] **11.** Разъяснить контракт Только эта коллекция; затем убрать/оформить понятную область.
- [ ] **12.** Убрать Мой словарь / Добавить запись из первичного toolbar, сохранить существующий API/данные.
- [ ] **13.** Убрать Введите слово для поиска из toolbar.
- [ ] **14.** Library сразу показывает упорядоченные результаты текущего фильтра без запроса; реальные данные, пагинация, ACL, загрузка/ошибки.
- [ ] **15.** Library Filters: число результатов/загрузка/ошибка, не требовать поисковое слово.
- [ ] **16.** Артикли только de/het; обе/ни одной — нет ограничения; единый выбор Builder/Library.
- [ ] **17.** Направление: общие карточки референса с разделителем и конкретными примерами выбранного языка; fallback без образца.
- [ ] **18.** Сверить слово в контексте с решениями, объяснить выключенный Translation/gates; не менять production gates молча.
- [ ] **19.** Русская подпись Идиомы / Устойчивые выражения и идиомы; согласованные EN/NL.
- [ ] **20.** Поиск источников визуально как в референсе; общий с23.
- [ ] **21.** Проверить происхождение фильтра Недавняя активность; объяснить контракт, согласовать понятное оформление.
- [ ] **22.** Убрать поиск из короткого списка изучаемых языков Builder.
- [ ] **23.** Поиск источников только при количестве более пяти.
- [ ] **24.** Statistics без горизонтального scrollbar: адаптивный период/колонки, доступные дни.
- [ ] **25.** Шеврон в конце Последние действия.
- [ ] **26.** Показывать язык Statistics даже при одном; выбор при нескольких.
- [ ] **27.** Различить словарь VanDale и опубликованную2K коллекцию, убрать двусмысленные дубли; личные коллекции отдельно.
- [ ] **28.** Убрать дублирующее Начато/не начато либо краткие человеческие подписи охвата без искажения данных.
- [ ] **29.** Раздел Биллинг и подписки: проверить рабочую интеграцию; не добавлять фиктивные платежные действия.
- [ ] **30.** Автоматический профиль устройства без ручного селектора; новое уточнение supersedes ручной выбор, сохранить настройки профилей.
- [ ] **31.** Text size компактно как режим темы, справа; сохранить масштаб и доступность.
- [ ] **32.** Preview стандартным общим renderer, с рамкой; без отдельной несовпадающей разметки.
- [x] **33.** Логотип кликабелен → Training/home; соблюдать блокировку pending action.
- [x] **34.** Загрузка: логотип/фон/краткий статус без рамок, без Indigo flash, предпочтение до первого UI, плавное появление/reduced motion.

Проверять референс desktop/mobile, EN/NL/RU, Normal/Extra, Light/Dark; реальные владельцы данных/действий и scheduling сохраняются.

Пункт3: ChevronDown/Up только для существующего меню; aria-expanded и владельцы действий неизменны. Проверки TrainingExcludeAction и typecheck проходят.

Пункт1: имя выбранной настройки передаётся отдельным display-параметром в owner запуска, сохраняется в существующей записи восстановления конкретной сессии и используется всеми тремя заголовками. Пресеты остаются серверными; подпись не является scheduling/identity. Старые записи используют имя материала, dictionary-scope без подписи — локализованное Current training. Проверены98 сценариев6suite, дополнительно имена всех семейств/roundtrip и приоритет имени над queue-label. Оригинальная вкладка владельца Settings не переключалась; финальная визуальная проверка владельцем остаётся возможной.

Пункт4: кадры реальной TrainingSenseCardStage воспроизвели разрыв — overlay уже удалён, header/answer opacity0. Общий motion owner теперь сохраняет прибывший prompt поверх ответа до полной видимости настоящего текста. Фокус/снятие action lock после переноса, плавное появление деталей и reduced motion сохранены. Регрессия сначала красная, затем6tests зелёные; typecheck/lint проходят. Повторный browser trace100frames: blank=[]; скриншот /tmp/407qa/correction4-reveal.png.

Пункт5: общая внешняя статья прозрачная, border/radius/shadow0 как flat reference; собственные поверхности/рамки значений сохранены. Training drawer больше не добавляет p-3 вокруг статьи. QA harness теперь наследует реальную practiceTheme вместо hardcoded dark canvas без токенов. Browser computed background transparent, border0; screenshot /tmp/407qa/correction5-flat.png. Dialog tests3pass, typecheck/lint/diff pass.

Пункт6: CSS соответствует marker-placement=above референса: top-20px, прозрачные маркеры, номер слева5px, статус справа8px, внешние интервалы22/32px. Browser подтвердил bottom207px у обоих маркеров при top210px рамки; expanded/collapsed видны на снимке /tmp/407qa/correction6-above.png. Изменение только CSS, значения/статусы сохранены; diff check проходит.

Пункт7: шеврон без фоновой заливки, смещение8px к верхнему правому углу; зона28px и focus-visible сохранены. Browser computed transparent; мышью свернуть и Enter раскрыть проверены, aria-expanded=true. Снимок /tmp/407qa/correction7-chevron.png. CSS-only; diff check pass.

Пункт8: заголовок/подсказка из общей локализации референса; headword/definition остаются sr-only context. Форма создания открывается плюсом после списка, фокус в имя; legacy форма прежняя. Поиск/чекбоксы/статусы/ошибки/блокировки/реальные callbacks сохранены. Проверки7tests, typecheck/lint/diff; browser initial and creation focus, снимок /tmp/407qa/correction8-collections.png.

Пункт9: approved WordDetailsHeader содержит только close, без текста/заливки/разделителя; PracticePanel aria-label сохраняет название диалога. Общий Library/Training header, legacy прежний. Dialog test3pass включая имя/отсутствие visible текста/animated close; typecheck/lint/diff pass. Browser fixture open/close, снимок /tmp/407qa/correction9-header.png.

Пункт10: approved header border-bottom0, legacy прежний. Browser реальная Settings вкладка без навигации/изменения preferences: border0, высота58px. Снимок /tmp/407qa/correction10-header.png; AppFrame tests/typecheck/diff проходят.

Пункт33: логотип — native button с локализованным назначением, вызывает существующий onNavigate(training), disabled при navigationDisabled. В BrandLogo optional span для валидной вложенности, прочие p callers прежние. Browser отдельная вкладка Settings→/Training; никакого запуска/оценки. Тест10pass включая pending lock, typecheck/lint/diff pass. Снимок /tmp/407qa/correction33-logo.png.

Пункт2: quiet approved button использует Sun/Moon/Monitor по сохранённому режиму, как BuilderPrototype; legacy SunMoon прежний. Размер18px/stroke1.5/tooltip/цикл/onCycleTheme/server preference сохранены. Browser read-only подтвердил системный Monitor и подпись; снимок /tmp/407qa/correction2-theme.png. AppFrame9tests/typecheck/lint/diff pass.

Пункт34: нейтральный startup с логотипом и простым статусом, без навигации/Indigo indicator/рамки. Account palette readiness gate не монтирует цветной интерфейс до real repository load, failure+retry видимы; существующий владелец предпочтений сохранён. Theme mode в layout effect до первого UI paint; ready fade220ms с reduced motion bypass. Browser slow network показал logo, затем saved graphite/system; временные условия сети/trace убраны, QA вкладка закрыта. Tests25pass; TrainingScreen69pass плюс один устаревший queue-title assertion исправлен под пункт1 и отдельно проходит; typecheck/lint/diff pass. Снимок /tmp/407qa/correction34-loading.png.

Пункт11: контракт investigated — active training list (fallback first accessible) ограничивает fetchWordsForList, не меняет состав/прогресс. Approved подпись с конкретным viewedListName на EN/NL/RU, без коллекции control скрыт; legacy прежний. Browser4031 entries/20-per-page в VanDale2k, scope checked; screenshot /tmp/407qa/correction11-scope.png. Tests19pass, typecheck/lint/diff pass. Этот screenshot также обнаружил оставшийся внешний Library aside фон пункта5; следующий короткий follow-up исправляет его.
