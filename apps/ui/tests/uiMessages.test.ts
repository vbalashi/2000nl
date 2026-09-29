import {expect,test} from 'vitest';
import en from '@/locales/en.json';
import nl from '@/locales/nl.json';
import ru from '@/locales/ru.json';
import {formatExerciseCount,formatUiMessage} from '@/lib/uiMessages';

function leaves(value:unknown,prefix=''):Record<string,string>{
 if(typeof value==='string')return {[prefix]:value};
 if(!value||typeof value!=='object')return {};
 return Object.fromEntries(Object.entries(value).flatMap(([key,child])=>Object.entries(leaves(child,prefix?`${prefix}.${key}`:key))));
}

test('EN/NL/RU UI catalogs have matching keys, parameters, and no blank messages',()=>{
 const reference=leaves(en.ui);
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
