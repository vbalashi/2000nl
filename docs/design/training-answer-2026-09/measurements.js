/* Single measurement registry for the annotation sheet and its tables.
 * Source: resolved Pencil instances captured 2026-09-06; raw nodes in pen-answer-source.json.
 * Numbers are logical Pen pixels, NOT pixels inferred from the owner's phone screenshots.
 * proposed is a candidate for the next real-component pass, not a production acceptance receipt.
 */
window.answerMeasurements = [
  {id:'M1',label:'Внутреннее поле карточки',pen:'18 px',current:'Отдельная проверка в браузере',proposed:'18 px',status:'Берём из образца',node:'v7BQfE/LpGoI',mark:{x1:10,y1:154,x2:28,y2:154},callY:147},
  {id:'M2',label:'Строка чипсов → блок слова',pen:'8 px',current:'0 px (gap-0)',proposed:'8 px',status:'Явное исправление',node:'v7BQfE/HSVVI',mark:{x1:257,y1:188,x2:257,y2:196},callY:192},
  {id:'M3',label:'Главное слово / артикль',pen:'44 / 20 px',current:'48 / 24 px¹',proposed:'44 / 20 px',status:'Newsreader, вес 500',node:'v7BQfE/HSVVI/s2hap4; v7BQfE/HSVVI/Y8gk7Y',mark:{x1:257,y1:196,x2:257,y2:240},callY:237},
  {id:'M4',label:'Слово → его перевод',pen:'2 px',current:'Нужно измерить раскрытый перевод',proposed:'2 px',status:'Не оставлять пустоту, если перевода нет',node:'v7BQfE/HSVVI/h5iuu8',mark:{x1:236,y1:240,x2:236,y2:242},callY:282},
  {id:'M5',label:'Перевод слова → определение',pen:'20 px²',current:'Другой состав отступов',proposed:'20 px с переводом',status:'Без перевода — отдельный вариант',node:'v7BQfE/LpGoI; v7BQfE/Un3AL',mark:{x1:236,y1:260,x2:236,y2:280},callY:327},
  {id:'M6',label:'Основной пример',pen:'16 px / строка 22.4 px',current:'13 px / строка 18.2 px',proposed:'16 px / строка 22.4 px',status:'Не уменьшать основной учебный текст',node:'v7BQfE/ttOGq',mark:{x1:382,y1:370,x2:382,y2:392},callY:382},
  {id:'M7',label:'Иконка внутри круглой кнопки',pen:'15 px; круг 30 px',current:'20 px',proposed:'Иконка 15 px; цель касания отдельно',status:'44×44 px — предложение для touch',node:'v7BQfE/HSVVI/odsJd',mark:{x1:270,y1:165.5,x2:285,y2:165.5},callY:97},
  {id:'M8',label:'Нижняя статистика',pen:'44 px; две строки',current:'Две строки',proposed:'Одна строка',status:'Высоту и длинные подписи проверяем позже',node:'iaBL3',mark:{x1:392,y1:820,x2:392,y2:864},callY:842}
];
window.answerTypeMeasurements = [
  ['Определение','Newsreader','16','400','1.15 → 18.4 px','Размер совпадает с кодом; проблема не только в нём'],
  ['Основной пример','Newsreader italic','16','400','1.4 → 22.4 px','В коде отдельная ветка уменьшает его до 13'],
  ['Перевод определения','Inter','13','400','1.35 → 17.55 px','Вторичный текст, не смешивать с примером'],
  ['Перевод слова','Inter','15','700','Не задан явно в Pen','Перед фиксацией нужен замер браузерной строки'],
  ['Часть речи','Inter','12','600','Не задан явно в Pen','Сейчас в коде 13 px'],
  ['Чип 2K','Geist Mono','9','700','Не задан явно в Pen','Сейчас наследует увеличенный размер строки'],
  ['Melden / Markeer als bekend','Inter','11.5','500','Не задан явно в Pen','Единый внешний вид и общая линия']
];
