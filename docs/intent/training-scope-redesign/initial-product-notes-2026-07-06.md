
I

вместо мутации карточки - добавлять свой перевод к существующей.
количество meanings для слова берётся из словаря (в основном, ведь словарь явняется хорошей базой для структуры и значений, тогда не нужно будет выдумывать свои). но если слова нет (в словаре, видимо), тогда создаём meaning 1 и дальше смотрим.
если пользователь добавил своё толкование своими словами - оно становится приоритетней чем основное (получается, нужно систему приоритетов? где она будет хранится? как правило на 2000нл или фронтенд будет её обрабатывать?). Если пользователь добавил свой перевод - он становится приоритетней чем стандартный. Можно пометить что первод неточный или что определение неточное, тогда даже если оно измениться а у пользователя есть своё - он будет видеть своё.

II

пользователь может добавить выражение или предложение в свой словарь, и оно автоматически предложит с какими словами headwords его слинковать. То есть пользователь может добавлять сколько угодно выражений, они все будут видны под одним headword, и для каждого будет зафиксирован provenance например, пользователь добавил из youtube 3 декабря - это зафиксируется для данного выражения, предложения или карточки слова. Поэтому для каждого объекта любого типа, который пользователь добавляет куда-то должно фиксироваться его источник и дата. Это видимо отдельная таблица или в рамках пользовательской таблицы словарной, где у каждой карточки будут такие метаданные. Если это существующая карточка, то headword всегда будет из основного словаря по принципу headword+part of speech+meaning id. Этот трпиплет является уникальным идентификатором который пользователь учит и который формирует карточку.

III

Если я выделяю выражение, то я хочу чтобы оно было переведено на мой язык перевода, или я хочу чтобы оно было объяснено на языке оригинала, возможно более просто или с примером? Плюс возможность перевести если нужно, но изначально - толкование на языке оригинала? Будет это некоей согласованностью с тем, что мы пытаемся получить толкование нежели перевод? И если мы выделяем фразу, то к какому headword мы будем добавлять? Мы должны будем сами ткнуть на главное слово, или алгоритм нам предложит, а за нами сохранится возможность выбрать другое и переопределить? Надо бы сделать тесты и посмотреть что кажется более естественным.

IV

у каждой карточки должен быть признак языка и словаря. тогда не нужно словари привязывать к языку, это будет обыкновенный фильтр словаря. Т.е. у словаря должен быть признак какого он языка (или языковой пары, если это двуязычный словарь). (а как мы храним словари? Предположим сейчас словарь один. Но может мы добавим в будущем 20 языков и в среднемо по 2 словаря в каждом. И в среднем по 30 тысяч слов в словаре. 20*2*30000=1.2 миллиона слов * 3 значения в среднем = 3.6 миллиона словарных карточек -> это нормально будет работать для быстрого поиска?)

V

списки слов могут быть shared. тогда нужно понять как делиться теми карточками, которые в личном словаре. Делать два словаря, public / personal? или ничего страншного если будет один, просто будут обращения к личному словарю?

VI

если я хочу чтобы любая фраза или выражение были добавлены к какому-то headword, то мы должны явно разделять что это карточка - headword, а эта - просто выражение или предложение, но обязательно слинкованное с headword. Тогда можно будет фильтровать по headword или выражения или предложения, смотря что мы записали. Если длинное предложение и оно у пользователя линкуется на карточку, то это его личная связь с данной карточкой и она только для него? или он может поделиться карточкой или предложением и тогда это будет для всех кто видит именно эту общую карточку? А если это список с общими карточками, но headwords - это микс из стандартнрых кароточек и каких-то уникальных пользовательских, не будет ли каши и путаницы?

VII

списки фильтров:

card-specific:
- language -> multiple choice (if user wants to mix languages, why not?)
- part of speech -> multiple choice
- is_2k -> frequency, checkbox
- has_idiom -> checkbox, means the definition has idiom
- is_irregular -> checkbox
- has_comparative -> checkbox
- has_superlative -> checkbox
- has_derivations -> checkbox
- learning_maturity -> number? should indicate how well this card is known. 0/new will mean not yet started learning. Can alos be a line with two sliders to show to/from. Can pontentially show a distribution chart on top of the line.
- is_hidden -> checkbox. To find all cards we hide. By default is negative, meaning we only see non-hidden cards.

Specific context filters:
- source_of_click -> multiple choice (checkboxes), e.g. YouTube videos or books or web-site
- time_of_click -> Last X hours/days. Could be timeline with start/end toggles which can be adjusted left or right. (сalendar picker as in the flight tickets start date - return date)

dictionaries:
- dictionary -> multiple choice. should become a filter so user can choose items from personal dictionary or from curated.


VIII

A mix of filters: card-specifics+context+dictionaries can become a named list. List can be curated (2k most used Dutch words, or irreguar English words), or personal (last 2 days from Youtube):
- list name -> one choice. List is already a combination of added cards from dictionaries + filters from above? Or list is a list of added cards only and pre-configured filter templates should be separately applied to them?
- shared lists? Lists can be shared and those shared with you are shown as a separate list.
User should be able to pick just one list at a time and it will trigger filter enablement.
- list can have collections for organization purposes, so each list can be nested under some list group name. Probably one list can present in multiple list groups. List group can also be shared for convenience, thus it will be easier to organize everything for teachers and/or for students and/or for subjects.
Lists and list groups as an objects should have obligatory name, author (when shared) and description.

IX

Do we apply filter to the list or to the dictionary or to all variety of words? ... List can be a dynamic list in case it is based on filters, or it can be fixed list when user adds words one by one during his work.

X

Queue builder page:

Most recent lists to pick from, or drop-down to select something more specific.
There should be a mean to organize lists: create/delete groups, move between groups, delete/create. Probably can be shown and separate pane appearing on demand and not visible during normal operation.

Three-pane interface for desktop and one-pane for mobile:
1. filters:
- card-specific
- context filters
- dictionaries
2. filtered word lists, dynamicly changing after filers are applied. One entry per headword+part-of-speech
3. details card for each word. renders details for each meaning ordered

XI

Training plan.

ready-made templates which are a comibinateion of below for quick toggle.
- new / review / new + review
- split between new / review
- scenario: multiple choice. w->d, d->w, both, audio card, audio type-in card, etc.
- amounts to see. Slider on a line to adjust from X to infinity (=all cards from a queue)

+ button 'start training'? Probably, common for 'Bibliothek' tab, which has queue builder and training plan.

XII

Main screen with training card should show current list and training plan + number of words in a queue (maybe current view with inicators of new/review/total is still fine). Clicking on it should toggle quick switch window to choose from pre-defined list and training plan template, and provide a button to deep dive into full setup page.


Settings for list/plan management:
statistics(yet just an ideas about what should be there):
- how many days streak with bar chart
- how many cards reviewed/added
- time spent reviewing and/or adding (reading or watching)
- cards mastered
- some retention insights
-
Bibliotheek:
- on the top can be: Queue builder / Training plan
- under each tab we will see what is described above.

XIII

Settings. Two pane.
1. General
- theme
- interface language
- translation language
-
2. Subscription
- premium / free status
- expiration date
- maybe some conditions or promo
- 'buy subscription' button
- invoices/payments
3. curated Dictionaries list
This will serve two purposes: show all curated dictionaries, so free users know about which they can use, and also allow users to toggle on/off a particular dictionary.
- a per-language list of dictionaries with toggles if user wants to switch off some dictionary from his list of active dictionaries. E.g., there can be Oxford dictionary and Cambridge dictionary (for premium users) for English and for some reason user wants to select only Cambridge while do not want to see articles/definitions from Oxford. Once disabled, it will dissabpear from the filter list of Bibliothek Queue bilder. However not clear how it will behave if user already added few cards articles based on this dictionary and then decided to toggle off it. Probably there should be some special list which keeps all user unfiltered queue and once user toggles this dictionary off, or subscription expired and dictionary toggle goes off automatically, user should still be able to see all his queue, right? Does it mean we need to add all what user added to learning to 'My dictionary/Personal dictionary' as a link/reference to the original dictionary article (headword), or should we create a special queue for it with user's links to this or that article? Assuming every article will be available even if premium expired, but was added before that.
This is still questionable and could be an overcomplication, but want to keep this opporutinity just in case there is a real use case for it. Probably most users will be more that satisfied with personal dictionary which can use AI to generate card contents.
Some dictinaries will existin in database, but will be invisible for users. This is a special dictionary tag 'invisible' which is for dictionaries not yet ready for publishing. E.g., VanDale lacks official permission, or dictionary is still being tested, etc. Such dictionaries will only be visible for super-users who are for example admins or testers.
