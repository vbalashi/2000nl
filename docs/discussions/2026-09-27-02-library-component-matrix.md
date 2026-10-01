# Library: компоненты и матрица вариантов

Дата: 27.09.2026. Содержательный конспект замечаний владельца и реализации, не стенограмма. Продолжение [вариантов плотности](2026-09-27-01-library-density-variants.md). Статус: визуальный эксперимент для выбора, не утверждённый production-дизайн.

## Замечания владельца

- Back to results и × дублируют выход. Оба расположения пока не приняты. Audio/Translate должны быть рядом с POS и чипсами сверху.
- Маленький безрамочный New нравится. Номер значения предпочтительно врезать в угол рамки, не резервируя колонку слева от всего содержимого. Оформить это компонентом.
- Кнопки всё ещё высокие. Нужны варианты компактности, формы и группировки.
- Learn и четыре оценки — основные действия в разных состояниях. Collections, Exclude, Report — вторичные. Exclude предлагает Mark as known или Manual exclude. Нужны варианты полного Learn и компактной группы; не показывать Learn и оценки одновременно.
- Сравнить скруглённые прямоугольники и круглые/капсульные кнопки.
- Сравнить мягкие блоки с цветными линиями и без них. Дополнительный вариант: фраза с линией снаружи, вложенное пояснение в мягком блоке.
- Изменение базового компонента должно применяться во всех его использованиях; не создавать независимую карточку для каждой комбинации.

## Что реально переиспользуется

Проверен текущий checkout, а не предположение по внешнему виду:

| Уровень | Сейчас | Дальнейшая граница |
| --- | --- | --- |
| Production Training / Library | Общие SenseCardChrome (headword, header action, reveal, badges); TrainingCardTemplates для тренировок | Сохранить capability/action и scheduling контракты |
| Production Library | LibrarySenseCardGroup содержит внутренние sense renderer, NestedContent, ContentText; врезанный ordinal написан inline | Общее оформление ещё не выделено полностью |
| Прототип | Использует production LibrarySenseCardGroupModel и SenseCardReveal; ratings теперь используют TrainingCardReviewButton | Нет обещания, что изменение prototype header изменяет production |
| Новая композиция прототипа | LibraryArticle → LibraryArticleHeader + MeaningCard → NumberedMeaningFrame + MeaningContent/LibraryContentNode + MeaningActions | Каждая комбинация использует те же компоненты; CSS варианты задаются контрактом |
| Примитивы | LibraryButton / LibraryIconButton / Metadata | После выбора перенести принятые primitives в общий presentation-слой, подключить реальным capabilities |

Изменения выполняются в owning layer `apps/ui/app/dev/session-builder-prototype`. Production-компоненты и БД не изменены. Перед переносом/декомпозицией production Library требуются characterization-проверки текущих capabilities, переводов, репортов, learning state и структуры nested content. Не переносить в production фиктивный локальный state machine.

## Матрица в коде

`libraryStudy.ts` — единый типизированный реестр допустимых значений. По нему рендерится таблица LibraryStudyPanel. CSS компонентов получает значения через props/data attributes. Все выборы сериализуются в URL и восстанавливаются после reload. Плотность списка меняется независимо; выбранное слово и раскрытые значения сохраняются при переключении сочетаний (до reload/смены слова).

| Ось | Варианты |
| --- | --- |
| Список | Compact / Reading |
| Возврат | Back arrow / Close ×; один элемент, не оба |
| Номер | Cut-in corner / Inside header |
| Высота | 28 / 34 px; на touch добавлен прозрачный запас зоны нажатия |
| Форма | Rounded rectangle / Pill и circle для иконок |
| Действия | Full-width + quiet row / Compact + quiet row / Compact + overflow |
| Вложенность | Typography / Soft blocks / Colour rails / Blocks + rails / Phrase outside block |
| Состояние-пример | New с Learn / Answer с четырьмя оценками |

Готовые комбинации: Quiet (компактный Learn, soft blocks), Guided (Learn во всю ширину, фраза снаружи блока), Tools (круглые иконки, меню, цветные линии). Это начальные точки; разрешены их смеси. В варианте Compact ratings занимают сетку 2×2, в остальных — одну строку из четырёх. На узком контейнере Report превращается в icon-only action с accessible name/title.

## Демонстрационные действия и ограничения

Learn → Learning; Exclude → Known или Excluded; есть Undo. Collections меняет только локальный checkbox. Report и оценки ничего не отправляют. Перевод, озвучка и Train next обозначены как previews. Блок оценок в Library — демонстрация компоновки, не решение включить настоящий FSRS review в Library. Меню закрывается Escape/по клику вне; после закрытия клавиатурный фокус возвращается на вызвавшую кнопку. Таблица — native dialog с focus containment.

Важная корректировка предположения: production Exclude сейчас имеет собственный контракт исключения пары; предложенное объединение с Known в UI не изменяет семантику backend. Эти действия должны оставаться отдельными capabilities.

## Проверка

Typecheck и целевой lint проходят. Проверены 1029px (main 840px), 412px и 360px; горизонтального переполнения нет. На мобильном остаётся естественная прокрутка страницы. Пройдены три готовые комбинации, смешанные numbering/height/scene, локальные Excluded/Known и Undo, Collections, открытие Report, оценки, URL/reload. Восстановлена светлая палитра реального rating-компонента внутри этого прототипа, без изменения production. Полный перебор всех комбинаций и полноценная accessibility-проверка не выполнялись.

Далее владелец выбирает композицию; затем выбранное оформление переносится в общий production presentation-слой с проверкой контрактов. История не означает принятия всех предложенных вариантов.
