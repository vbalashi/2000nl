# 2026-10-18: подбор значений, личные черновики и длинное видео

Источник: последующее обсуждение владельца в #742. Требования ниже приняты на уровне
направления; runtime не реализован и платные эксперименты не запускались.
Предыдущее предложение сохраняется в [discovery](2026-10-18-01-agent-material-import.md).

## Уточнения владельца

- Без контекста по умолчанию брать первое значение в словарном порядке, не все.
  Показывать, что выбрано первое, и давать изменить/добавить остальные. При разных
  словарях/омографах ещё требуется явная политика выбора владельца: first sense
  не означает произвольный первый search result или сортировку UUID.
- В двуязычном списке перевод не входит в коллекцию, но может определять нужный
  смысл. Это заменяет прежнее полное игнорирование английского при resolution.
  Context resolver может выбрать одно или несколько подходящих значений и показать
  номера/определения и основание. Не создавать фиктивную уверенность.
- Сначала использовать подходящие существующие entries. Только оставшиеся слова,
  фразы/выражения образуют очередь personal generation. Не требовать полного
  corpus/core/editorial pipeline как обязательного условия личной карточки.
- Владелец предложил лёгкую one-shot personal draft generation с возможностью
  изменить, дополнить и обсудить результат. Это предпочтительное направление для
  пилота; точный состав/автосохранение и редактирование ещё проектируются. Не называть
  такой draft независимо reviewed либо эквивалентом принятой общей статьи.
  Полный runbook2.2 сохраняется для отдельного качества/публикации, не удаляется.
  Product edit generated private content и linked override shared content (#87)
  различаются; новая edit capability не объявляется существующей.
- Union двух collections — будущая функция: при недоступном материале можно
  тренировать оставшийся, progress сохранить на прежних IDs. Revoked content не
  отображается; access checks не заменяются наличием membership.

## Масштаб и tools — запрос владельца

Нужны collection reads и поиск по исходной форме/леммам/примерам; агент должен
понимать, что именно можно добавить. Часовой YouTube может содержать много кандидатов;
не отправлять все тысячи в отдельные бесконечные model loops. Владелец предлагает
быстрый deterministic extraction/lemmatization/dedup/filter путь, затем агент для
непокрытого; замерить полноту, скорость и стоимость. Серверная durable задача должна
переживать разрыв связи. YouTube — личный приоритет владельца и первый source adapter.
Это не разрешение на production записи, большой runtime feature или paid mass run.

## Предложенная реализация для последующего review

Серверный координатор, не LLM, хранит worklist/cursor/receipts и назначает chunks.
Один context extraction/lemma этап → batch exact/form lookup → existing dictionary
multiword/form matching → contextual resolution только спорных → bounded LLM
expression discovery и остатки → personal draft queue. Model tools доступны для
точечных расширений поиска, но не требуется вызов на каждый token. Словарные
выражения не требовать впервые изобрести NLP; существующие multiword units можно
искать phrase matcher. Пропуски deterministic baseline честно измерять.

Сохранять occurrence/context/timecodes при dedup: одно слово в видео может иметь
несколько значений. Stoplist не равна отсутствию предлогов/компонентов в expressions;
Known/частотность — опциональный видимый фильтр, не вывод «пользователь это знает».
Длинный текст разбивать на предложения/фрагменты с mapping и overlap для выражений;
модели передавать candidate+достаточный bounded context и shortlist, не всё видео.
Batch размеры/параллельность/лимиты подбираются измерением; slow path выдаёт результат
по мере готовности, не перезаписывает ручные решения и не расширяет collection скрыто.

Tools: collection list/read/search + membership; catalog exact/form/lemma batch,
example evidence search и entry/sense read; preview/resolve/apply/status/cancel/undo;
personal draft/edit/save отдельно. Example evidence не trainable expression ID.
Server scopes/private auth на каждом шаге; модель не задаёт principal/SQL.

Пилот: сохранённые субтитры короткого/среднего/часового видео, сначала offline/no-model
baseline; считать tokens/unique forms/lemmas/candidates, coverage existing IDs,
ambiguous/missing, contextual/phrase accuracy на ручном срезе, timings per stage,
DB round trips; затем разрешённый bounded model pass только на остатках. Учитывать
provider paid fallback и модельные retries/unknown usage, TT first useful result и
полное wall time. 1000 distinct forms ≠1000 LLM requests и ≠1000 новых учебных entries.
До измерений не обещать цену или секунды; новые HTTP batch contracts не считать
существующими по наличию single-item lookup.
