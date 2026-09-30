import React from 'react';
import {fireEvent,render,screen,within} from '@testing-library/react';
import {beforeEach,expect,test,vi} from 'vitest';
import {TrainingSessionPrototype} from '@/app/dev/session-builder-prototype/TrainingSessionPrototype';
import {RecentActivity} from '@/app/dev/session-builder-prototype/RecentActivity';
import {CardReportDialog} from '@/app/dev/session-builder-prototype/LibraryOverlays';
import {InterfaceLanguageContext} from '@/app/dev/session-builder-prototype/VariantControls';
import {initialDraft} from '@/app/dev/session-builder-prototype/model';
import type {PreviewRun} from '@/app/dev/session-builder-prototype/sessionPreviewModel';

beforeEach(()=>{
 vi.stubGlobal('ResizeObserver',class {observe(){} disconnect(){}});
 Object.defineProperty(HTMLElement.prototype,'scrollTo',{configurable:true,value:vi.fn()});
 Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.setAttribute('open','');}});
 Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.removeAttribute('open');}});
});
const run:PreviewRun={id:1,trainingId:'core',name:'My personal name',draft:{...initialDraft,size:1},translation:'English'};
function props(){return {run,active:true,onClose:vi.fn(),onHistory:vi.fn(),onAction:vi.fn(),onProgress:vi.fn()};}

test('locale change preserves typed answer and reveal while grading emits canonical results',()=>{
 const p=props();p.run={...run,draft:{...run.draft,mode:'Type the answer'}};
 const view=render(<InterfaceLanguageContext.Provider value="en"><TrainingSessionPrototype {...p}/></InterfaceLanguageContext.Provider>);
 fireEvent.change(screen.getByRole('textbox',{name:'Your answer'}),{target:{value:'een fiets'}});
 view.rerender(<InterfaceLanguageContext.Provider value="ru"><TrainingSessionPrototype {...p}/></InterfaceLanguageContext.Provider>);
 expect(screen.getByRole('textbox',{name:'Ваш ответ'})).toHaveValue('een fiets');
 fireEvent.click(screen.getByRole('button',{name:'Сравнить ответ'}));
 expect(screen.getByText('Ваш ответ: een fiets')).toBeInTheDocument();
 expect(screen.getByText('Выражения и употребление')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Хорошо'}));
 expect(p.onAction.mock.calls[0][0]).toMatchObject({result:'Good',exercise:'Words · Direct'});
 expect(screen.getByText('My personal name')).toBeInTheDocument();
 expect(screen.getByRole('heading',{name:'Тренировка завершена'})).toBeInTheDocument();
});

test('known and excluded actions remain distinct and reversible after translating controls',()=>{
 const p=props();render(<InterfaceLanguageContext.Provider value="nl"><TrainingSessionPrototype {...p}/></InterfaceLanguageContext.Provider>);
 fireEvent.click(screen.getByRole('button',{name:'Uitsluiten'}));
 fireEvent.click(screen.getByRole('menuitem',{name:'Als bekend markeren'}));
 expect(screen.getByText('Gemarkeerd als bekend')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Ongedaan maken'}));
 expect(p.onAction).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Uitsluiten'}));fireEvent.click(screen.getByRole('menuitem',{name:'Uitsluiten'}));
 fireEvent.click(screen.getByRole('button',{name:'Volgende kaart'}));
 expect(p.onAction.mock.calls[0][0].result).toBe('Excluded');
});

test('history translates results, exercise labels and dates while keeping dictionary words',()=>{
 render(<InterfaceLanguageContext.Provider value="ru"><RecentActivity onClose={vi.fn()} items={[{id:'1',word:'het huis',exercise:'Words · Reverse',result:'Known',at:'2026-09-28T12:30:00Z'}]}/></InterfaceLanguageContext.Provider>);
 const dialog=screen.getByRole('dialog',{name:'Последние действия'});
 expect(dialog).toHaveAttribute('lang','ru');
 expect(within(dialog).getByText('het huis')).toBeInTheDocument();
 expect(within(dialog).getByText('Слова · Обратный')).toBeInTheDocument();
 expect(within(dialog).getByText('Знакомое')).toBeInTheDocument();
 expect(within(dialog).getByRole('heading',{name:/28 сентября 2026/})).toBeInTheDocument();
 expect(within(dialog).getByRole('button',{name:'Закрыть историю действий'})).toBeInTheDocument();
});

test('report reason stays selected across locale changes and preview never submits',()=>{
 const notice=vi.fn(),close=vi.fn();const view=render(<InterfaceLanguageContext.Provider value="en"><CardReportDialog onClose={close} onNotice={notice}/></InterfaceLanguageContext.Provider>);
 fireEvent.change(screen.getByRole('combobox'),{target:{value:'Wrong meaning'}});
 view.rerender(<InterfaceLanguageContext.Provider value="ru"><CardReportDialog onClose={close} onNotice={notice}/></InterfaceLanguageContext.Provider>);
 expect(screen.getByRole('combobox',{name:'Причина сообщения'})).toHaveValue('Wrong meaning');
 fireEvent.click(screen.getByRole('button',{name:'Проверить сообщение'}));
 expect(close).toHaveBeenCalledOnce();expect(notice).toHaveBeenCalledWith('Неверное значение · демонстрационное сообщение, ничего не отправлено');
});
