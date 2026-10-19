# Две коллекции и личные статьи: сохранение по поручению владельца

2026-10-19. Владелец явно попросил добавить последние два видео в свои коллекции и сохранить подходящие недостающие статьи в личный словарь. [Обсуждение и разрешение](../../../discussions/2026-10-19-06-ai-workspace-and-context-dialog.md). Это отдельный шаг после исследовательского [RESULT.md](RESULT.md), где user writes ещё отсутствовали; исторический результат не переписан.

| Созданная коллекция | Существующие значения | Личные статьи в составе | Всего |
|---|---:|---:|---:|
| YouTube — LUBACH: Huizen in Spanje |272|12|284|
| YouTube — Easy Dutch: Wedding Vocabulary |309|12|321|

Созданы **23 уникальные личные статьи**, одна используется в обеих коллекциях. В частности: `nergens op slaan`, `iets op de rit hebben`, `wegpesten`, `geregistreerd partnerschap`, `eraan toegaan`, `een kind erkennen`. У каждой короткое NL определение, новый NL пример, грамматическая/регистровая пометка, generated tag и generation/source metadata. Статьи принадлежат владельцу в private/unpublished user dictionary и редактируются существующим UI. Персональные заметки `user_word_notes` не менялись: notes внутри этих статей — авторское содержимое, а не новая система learner annotations.

## Подбор и генерация

Выполнены500основных principal-scoped lookup queries на источник, приоритет лемм/частиц/форм;134/210дополнительных базовых query variants остались явно deferred. Дополнительные canonical/surface и component queries строятся из всех уникальных reviewed expression headings. Полная фраза с placeholder может ничего не найти, хотя внутри компонентной статьи есть идиома. Поэтому finite lookup не называется global absence.

Две отдельные Luna low роли выбирали существующие значения и проверяли выбор по source context без объяснения selector. Общие reviewed decisions1039(457+582), включая unique phrase headings, отфильтрованные word candidates и finite first3contexts на слово; это не все словоупотребления. Expressions повторно разрешены на enriched component snapshot(102/155cases), чтобы не генерировать статью только из-за провала exact phrase search. Финальный состав берёт word evidence исходного прохода и обновлённые expression targets, а не слепой union двух несовместимых решений. Known не использовался как фильтр.

Для generation отдельно отобрано до12полезных отсутствующих dedicated targets на видео. Это **bounded curation**, не генерация всех сотен unresolved фраз. Luna high создаёт ограниченные PersonalDraft fields; другая отдельная Luna high проверка смотрит на исходный контекст, пример, grammar и title. Восемь черновиков отправлены на один repair cycle; один исходный needs_resolution не сохранён. Все23финальных прошли model review и операторский просмотр; независимого native-speaker gold нет.

Редактор тоже ошибается: один исходный комментарий содержал испорченную non-Dutch форму глагола. Она сохранена в evidence, не скопирована в статью; repair перепроверял замечания и вернул правильные Dutch forms. Оператор нормализовал заголовок `het gaan om iets` в `het gaat om iets`; исходная модельная версия и write plan сохранены. Ни fluent generation, ни verdict acceptable_draft не считаются абсолютной гарантией.

## Запись и доказательства

Только существующие owner-checked RPC: ensure_user_dictionary при отсутствии канонического словаря, create_user_dictionary_entry с явно выбранным private dictionary ID, create_user_word_list и add_entry_to_user_list. Существующий default dictionary не переименовывался через ensure, shared visibility не менялась, чужие записи не редактировались. Модель не получила SQL/user-ID/write-tool.

Сначала успешный rollback dry-run, затем один commit с23статьями и605memberships. Первый диагностический dry-run выявил неоднозначную SQL-переменную description; транзакция целиком откатилась. Исправленный успешный dry-run и commit не меняют fingerprint user_card_status и число user_card_action_events. Добавление в коллекцию не запускает обучение.

После commit отдельный authenticated read:

- полные множества605entry IDs совпали с manifest, не только counts;
- owner обеих коллекций совпал;
- все23private entries читаются через application-gated fetch RPC;
- все23сохранили generated metadata; dictionary private/unpublished;
- повторный dry-run переиспользовал те же статьи/коллекции, createdArticles0.

Приватные UUID/словари/контексты и SQL receipts находятся в ignored `tmp/agent-import-742/newvideos-luna-20261019/account-*`, `account-save-plan.json`, `apply-account-plan.py`. Это operator maintenance proof, не production AI permission model. Фильтруемые source/channel metadata и folders ещё не внедрены: сейчас video/channel находятся в имени/описании flat collection.

Дополнительно выполнено119model HTTP calls, published known token estimate$0.110921775, без ASR/SQL/hosting/invoice reconciliation. Существующая модельная проверка может давать false veto и не все unresolved candidates сохранены. [Санитизированные агрегаты](ACCOUNT-SAVE-20261019.json).

Приложение/схема не менялись. [Предложенный in-app план](../IN-APP-AI-PLAN-20261019.md) и [аудит готовности](../AI-ENTRYPOINT-READINESS-20261019.md) отделяют уже работающие primitives от нового durable conversation/run/confirmation слоя.
