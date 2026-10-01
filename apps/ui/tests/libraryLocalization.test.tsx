import React from 'react';
import {fireEvent,render,screen,within} from '@testing-library/react';
import {beforeEach,expect,test,vi} from 'vitest';
import {InterfaceLanguageContext} from '@/app/dev/session-builder-prototype/VariantControls';
import {LibraryFilters,defaultLibraryFilter,libraryFilterSummary} from '@/app/dev/session-builder-prototype/LibraryFilters';
import {CollectionPicker} from '@/app/dev/session-builder-prototype/LibraryOverlays';
import {LibraryArticle} from '@/app/dev/session-builder-prototype/LibraryArticle';
import {MeaningActions} from '@/app/dev/session-builder-prototype/LibraryActions';
import {detailGroups} from '@/app/dev/session-builder-prototype/LibraryWordDetails';
import {studyDefaults} from '@/app/dev/session-builder-prototype/libraryStudy';

beforeEach(()=>{
 vi.stubGlobal('ResizeObserver',class {observe(){} disconnect(){}});
 Object.defineProperty(HTMLElement.prototype,'scrollTo',{configurable:true,value:vi.fn()});
 Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.setAttribute('open','');}});
 Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.removeAttribute('open');}});
});

test('filter query, page and selections survive locale changes; apply emits stable source and part IDs',()=>{
 const apply=vi.fn();const props={value:defaultLibraryFilter,sources:['VanDale','Custom title'],count:()=>3,onClose:vi.fn(),onApply:apply};
 const view=render(<InterfaceLanguageContext.Provider value="en"><LibraryFilters {...props} layout="chips"/></InterfaceLanguageContext.Provider>);
 fireEvent.click(screen.getByRole('button',{name:'Nouns'}));
 fireEvent.click(screen.getByRole('button',{name:/^Source/}));
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'Van'}});
 view.rerender(<InterfaceLanguageContext.Provider value="ru"><LibraryFilters {...props} layout="chips"/></InterfaceLanguageContext.Provider>);
 expect(screen.getByRole('textbox',{name:'Поиск источников'})).toHaveValue('Van');
 fireEvent.click(screen.getByRole('button',{name:'VanDale'}));fireEvent.click(screen.getByRole('button',{name:'ОК'}));
 expect(screen.getByRole('button',{name:'Существительные'})).toHaveAttribute('aria-pressed','true');
 fireEvent.click(screen.getByRole('button',{name:'Показать результаты'}));
 expect(apply).toHaveBeenCalledWith({...defaultLibraryFilter,parts:['Nouns'],source:'VanDale'});
 expect(libraryFilterSummary({...defaultLibraryFilter,parts:['Nouns'],article:'het'},'ru')).toBe('нидерландский · Все словари · Существительные (het)');
});

test('localized language search emits canonical language and clears language-specific source/article',()=>{
 const apply=vi.fn();render(<InterfaceLanguageContext.Provider value="nl"><LibraryFilters value={{...defaultLibraryFilter,source:'VanDale',article:'de'}} sources={['VanDale']} count={()=>0} onClose={()=>{}} onApply={apply}/></InterfaceLanguageContext.Provider>);
 fireEvent.click(screen.getByRole('button',{name:/^Taal/}));fireEvent.change(screen.getByRole('textbox'),{target:{value:'Duits'}});
 fireEvent.click(screen.getByRole('button',{name:'Duits'}));fireEvent.click(screen.getByRole('button',{name:'OK'}));fireEvent.click(screen.getByRole('button',{name:'Resultaten tonen'}));
 expect(apply).toHaveBeenCalledWith({...defaultLibraryFilter,language:'German'});
});

test('collection picker keeps query and user-supplied name while switching locale and emits canonical membership IDs',()=>{
 const create=vi.fn(),toggle=vi.fn();const props={catalog:[{id:'custom',name:'My exact name',count:24}],selected:['custom'],onToggle:toggle,onCreate:create,onClose:()=>{}};
 const view=render(<InterfaceLanguageContext.Provider value="en"><CollectionPicker {...props}/></InterfaceLanguageContext.Provider>);
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'My'}});
 fireEvent.click(screen.getByRole('button',{name:'New collection'}));fireEvent.change(screen.getByRole('textbox',{name:'Collection name'}),{target:{value:'New exact title'}});
 view.rerender(<InterfaceLanguageContext.Provider value="ru"><CollectionPicker {...props}/></InterfaceLanguageContext.Provider>);
 expect(screen.getByRole('textbox',{name:'Поиск коллекции'})).toHaveValue('My');
 expect(screen.getByRole('textbox',{name:'Название коллекции'})).toHaveValue('New exact title');
 fireEvent.click(screen.getByRole('checkbox'));expect(toggle).toHaveBeenCalledWith('custom');
 expect(screen.getByText('24 карточки')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Создать и добавить'}));expect(create).toHaveBeenCalledWith('New exact title');
});

test('word forms remain expanded across locale changes and Dutch table data retains content language',()=>{
 const props={model:detailGroups[1],source:'VanDale',study:studyDefaults,onClose:()=>{},embedded:true};
 const view=render(<InterfaceLanguageContext.Provider value="en"><LibraryArticle {...props}/></InterfaceLanguageContext.Provider>);
 fireEvent.click(screen.getByRole('button',{name:'Show more forms of gaan'}));
 view.rerender(<InterfaceLanguageContext.Provider value="ru"><LibraryArticle {...props}/></InterfaceLanguageContext.Provider>);
 expect(screen.getByRole('button',{name:'Скрыть формы слова gaan'})).toHaveAttribute('aria-expanded','true');
 const table=screen.getByRole('table',{name:'Формы глагола gaan'});
 expect(within(table).getByRole('columnheader',{name:'Прошедшее'})).toBeInTheDocument();
 expect(table.querySelector('td')).toHaveAttribute('lang','nl');
});

test('localized card actions preserve explicit learning and undo semantics',()=>{
 const state=vi.fn(),notice=vi.fn();const p={cardId:'id',study:studyDefaults,state:'new' as const,onState:state,onNotice:notice};
 const view=render(<InterfaceLanguageContext.Provider value="ru"><MeaningActions {...p}/></InterfaceLanguageContext.Provider>);
 fireEvent.click(screen.getByRole('button',{name:'Учить'}));expect(state).toHaveBeenCalledWith('learning');
 view.rerender(<InterfaceLanguageContext.Provider value="nl"><MeaningActions {...p} state="known"/></InterfaceLanguageContext.Provider>);
 fireEvent.click(screen.getByRole('button',{name:'Bekend ongedaan maken'}));expect(state).toHaveBeenLastCalledWith('new');
});
