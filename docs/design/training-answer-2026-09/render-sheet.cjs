// Offline documentation rendering only. Does not launch a browser or execute the HTML page.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sharp = require(process.env.ANSWER_SHARP_PATH || 'sharp');
const root = __dirname;
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'measurements.js'), 'utf8'), context);
const measurements = context.window.answerMeasurements;
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const img = fs.readFileSync(path.join(root, 'assets/twUIm.png')).toString('base64');
const label = (x, y, text, size = 14, fill = '#172333', weight = 400) => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}">${esc(text)}</text>`;
const line = (x1, y1, x2, y2, stroke = '#007c83') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}"/>`;
const defs = `<defs><marker id="a" markerWidth="6" markerHeight="6" refX="1" refY="3" orient="auto"><path d="M5 0L1 3L5 6" fill="none" stroke="#63e4d1"/></marker><marker id="b" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M1 0L5 3L1 6" fill="none" stroke="#63e4d1"/></marker></defs>`;
function drawing(){
 let s=`<image href="data:image/png;base64,${img}" x="0" y="0" width="402" height="874"/>`;
 s+=`<rect x="9" y="140" width="384" height="130" rx="8" fill="none" stroke="#e9b76a" stroke-dasharray="5 4"/>`;
 for(const m of measurements){const {x1,y1,x2,y2}=m.mark;
  s+=`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#63e4d1" stroke-width="1.5" marker-start="url(#a)" marker-end="url(#b)"/>`;
  s+=`<path d="M${(x1+x2)/2} ${(y1+y2)/2}H410L425 ${m.callY}H437" fill="none" stroke="#007c83"/>`;
  s+=`<circle cx="450" cy="${m.callY}" r="13" fill="#e4faf5" stroke="#007c83"/>`;
  s+=`<text x="450" y="${m.callY+4}" font-size="11" text-anchor="middle" fill="#07504f">${m.id}</text>`;
  s+=label(472,m.callY+4,m.id==='M6'?'16 px / 1.4':m.pen.split(';')[0],13);
 }
 s+=label(438,27,'Исходник',13)+label(438,47,'402 × 874',13);
 s+=label(438,456,'Закрепляем:',13,'#8a4800')+label(438,474,'чипсы, слово, перевод',13,'#8a4800');
 s+=`<path d="M393 259H416V450H430" fill="none" stroke="#aa5900"/>`;
 s+=`<path d="M390 420V665M385 425L390 420L395 425M385 660L390 665L395 660" fill="none" stroke="#e9b76a"/>`;
 s+=line(395,554,428,554,'#aa5900')+label(438,550,'Прокручиваем:',13,'#8a4800')+label(438,568,'содержимое ниже',13,'#8a4800');
 s+=`<rect x="9" y="690" width="384" height="122" rx="7" fill="none" stroke="#e9b76a" stroke-dasharray="5 4"/>`;
 s+=line(394,731,428,731,'#aa5900')+label(438,728,'Кнопки остаются',13,'#8a4800')+label(438,746,'на месте',13,'#8a4800');
 return s;
}
async function main(){
 let s=`<svg xmlns="http://www.w3.org/2000/svg" width="1220" height="1070" font-family="Arial, sans-serif"><rect width="1220" height="1070" fill="#f4f5f7"/>${defs}`;
 s+=label(24,28,'2000NL · 06.09.2026 · ЛИСТ 01',12,'#536577');
 s+=label(24,64,'Answer: измеряем образец, исправляем конкретные расхождения',26,'#172333',600);
 s+=label(24,90,'Настоящий экспорт 30.95.08. Размерные линии — обмер; янтарные границы — предлагаемое закрепление.',14,'#536577');
 s+=`<g transform="translate(24 112)">${drawing()}</g>`;
 s+=label(672,144,'№ / что измеряем',14,'#536577')+label(963,144,'Pen → первый образец',14,'#536577');
 for(let i=0;i<measurements.length;i++){const m=measurements[i],y=166+i*63;s+=line(672,y+53,1186,y+53,'#d6dde4');s+=label(672,y+14,m.id,13,'#007c83',600)+label(706,y+14,m.label,13);s+=label(706,y+36,m.status,11,'#536577');s+=label(963,y+14,m.pen,13);s+=label(963,y+36,'→ '+m.proposed,12,'#07504f');}
 s+=label(672,713,'Сегодня достаточно оценить M2, M3 и M6.',17,'#172333',600);
 s+=label(672,742,'Определение уже 16 px, но основной пример стал 13 px.',14);
 s+=label(672,766,'Слово выросло до 48 px, зазор над ним исчез.',14);
 s+=label(672,804,'Не переносим ошибки исходника:',16,'#8a4800',600);
 for(const [i,t]of ['Светлый header — в светлой теме.','Иконки разделов и вертикальные линии сохраняем.','New / Review / Total — в одну строку.','Theme / Settings — сверху; History / Close — у сессии.'].entries())s+=label(672,831+i*24,t,14);
 s+=label(672,953,'Это ещё не исправленное приложение.',14,'#536577');
 s+=label(672,976,'Точный responsive-профиль — следующая малая приёмка.',13,'#536577');
 s+=label(24,1024,'¹ Обычная длина слова. ² 20 px = 6 + 14; без перевода в .09 расстояние 32 px = 18 + 14.',13,'#536577');
 s+=label(24,1048,'Pen pixels ≠ физические пиксели телефонного скриншота. Source nodes и таблица: measurements.js / pen-answer-source.json.',12,'#536577')+'</svg>';
 await sharp(Buffer.from(s)).png().toFile(path.join(root,'assets/answer-measurement-sheet.png'));
 const focus=`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="455" font-family="Arial, sans-serif"><rect width="640" height="455" fill="#f4f5f7"/>${defs}${label(16,28,'Answer · обмер 30.95.08',20,'#172333',600)}${label(16,51,'M2: воздух над словом · M3: размер слова · M6: пример',12,'#536577')}<svg x="16" y="70" width="610" height="325" viewBox="0 80 610 325">${drawing()}</svg>${label(16,425,'Обмер исходника, не новый экран. Полный лист содержит таблицу и зоны прокрутки.',12,'#536577')}</svg>`;
 await sharp(Buffer.from(focus)).png().toFile(path.join(root,'assets/answer-focus.png'));
 console.log('Rendered static sheet and focus diagram; HTML browser preview not exercised.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
