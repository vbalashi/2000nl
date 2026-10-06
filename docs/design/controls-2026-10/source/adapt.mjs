import fs from 'node:fs';
export function adapt(source,here){
 source=source.replace('  Pencil,','  Pencil,\n  Info,');
 source=source.replace('import { TrainingMixPicker }','import { exerciseSummary } from "./summary";\nimport { SourcePicker } from "./SourcePicker";\nimport { TrainingMixPicker }');
 source=source.replace('`${familyName} · ${direction}`','exerciseSummary(family, familyName, direction)');
 const start=source.indexOf('          {section(\n            "language"'),end=source.indexOf('          {section(\n            "exercises"',start);
 if(start<0||end<0)throw Error('Section boundaries changed');
 source=source.slice(0,start)+`          <div className="review-section-group">
          <section className="review-inline-language"><h2>{b.language}</h2><div className={s.choices}>{p.languageOptions.map(option=><BuilderChoice key={option.value} active={option.value===p.languageCode} disabled={p.languagePending} onClick={()=>p.onLanguageChange(option.value)}>{language(option.value)}</BuilderChoice>)}</div></section>
          {section("source",b.source,material,<SourcePicker locale={p.interfaceLanguage} lists={p.lists} dictionaries={p.dictionaries} draft={p.draft} onChange={p.onDraftChange}/>)}
`+source.slice(end);
 source=source.replace('          {p.accountControls}','          </div>\n          {p.accountControls}');
 source=source.replace('help={c.mixHelp}','help=""');
 source=source.replace('            </div>,\n          )}\n          </div>',`              <p className="review-session-note"><Info size={13} aria-hidden="true"/><span>{p.interfaceLanguage==="ru"?"Фактический размер сессии и баланс новых карточек и повторений зависят от доступных карточек.":p.interfaceLanguage==="nl"?"De werkelijke sessiegrootte en verhouding tussen nieuwe kaarten en herhalingen hangen af van de beschikbare kaarten.":"Actual session size and new/review balance depend on available cards."}</span></p>
            </div>,
          )}
          </div>`);
 return source;
}
