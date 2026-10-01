import {expect,test} from 'vitest';
import en from '@/locales/en.json';
import nl from '@/locales/nl.json';
import ru from '@/locales/ru.json';
import {formatExerciseCount,formatMeaningAvailability,formatUiMessage,formatUiCount,getUiMessages} from '@/lib/uiMessages';
import {balances} from '@/app/dev/session-builder-prototype/model';

function leaves(value:unknown,prefix=''):Record<string,string>{
 if(typeof value==='string')return {[prefix]:value};
 if(!value||typeof value!=='object')return {};
 return Object.fromEntries(Object.entries(value).flatMap(([key,child])=>Object.entries(leaves(child,prefix?`${prefix}.${key}`:key))));
}

test('EN/NL/RU UI catalogs have matching keys, parameters, and no blank messages',()=>{
 const reference=leaves(en.ui);
 expect(en.ui.builder.balance).toHaveLength(balances.length);
 for(const catalog of [nl.ui,ru.ui]){
  const candidate=leaves(catalog);
  expect(Object.keys(candidate).sort()).toEqual(Object.keys(reference).sort());
  for(const [key,value] of Object.entries(candidate)){
   expect(value.trim(),key).not.toBe('');
   const parameters=(text:string)=>[...text.matchAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g)].map(match=>match[1]).sort();
   expect(parameters(value),key).toEqual(parameters(reference[key]));
  }
 }
});

test('exercise counts use locale plural rules',()=>{
 expect(formatExerciseCount('en',1)).toBe('1 exercise');
 expect(formatExerciseCount('nl',2)).toBe('2 oefeningen');
 expect(formatExerciseCount('ru',1)).toBe('1 упражнение');
 expect(formatExerciseCount('ru',2)).toBe('2 упражнения');
 expect(formatExerciseCount('ru',5)).toBe('5 упражнений');
 expect(formatExerciseCount('ru',21)).toBe('21 упражнение');
 expect(formatUiMessage(ru.ui.trainingOverview.edit,{name:'Core vocabulary'})).toBe('Изменить «Core vocabulary»');
});

test('meaning availability handles Russian plurals and localized large counts',()=>{
 expect(formatMeaningAvailability('ru',0)).toBe('Доступно 0 значений');
 expect(formatMeaningAvailability('ru',1)).toBe('Доступно 1 значение');
 expect(formatMeaningAvailability('ru',2)).toBe('Доступно 2 значения');
 expect(formatMeaningAvailability('ru',5)).toBe('Доступно 5 значений');
 expect(formatMeaningAvailability('ru',21)).toBe('Доступно 21 значение');
 expect(formatMeaningAvailability('en',1000)).toBe('1,000 meanings available');
 expect(formatMeaningAvailability('nl',1000)).toBe('1.000 betekenissen beschikbaar');
});

 test('training ratios follow interface plural rules even for preserved saved ratios',()=>{expect(formatUiCount('en',1,getUiMessages('en').builder,'ratio')).toBe('1 new : 1 review');expect(formatUiCount('nl',2,getUiMessages('nl').builder,'ratio')).toBe('1 nieuw : 2 herhalingen');expect(formatUiCount('ru',1,getUiMessages('ru').builder,'ratio')).toBe('1 новая : 1 повторение');expect(formatUiCount('ru',5,getUiMessages('ru').builder,'ratio')).toBe('1 новая : 5 повторений');expect(formatUiCount('ru',21,getUiMessages('ru').builder,'ratio')).toBe('1 новая : 21 повторение');});
