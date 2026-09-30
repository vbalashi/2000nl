import React from 'react';
import {fireEvent,render,screen} from '@testing-library/react';
import {beforeAll,expect,test,vi} from 'vitest';
import {BuilderScopePicker} from '@/app/dev/session-builder-prototype/BuilderScopePicker';
import {SavedTrainingControls} from '@/app/dev/session-builder-prototype/SavedTrainingControls';
import {TranslationDirectionPreview} from '@/app/dev/session-builder-prototype/TranslationDirectionPreview';
import {Directions,InterfaceLanguageContext} from '@/app/dev/session-builder-prototype/VariantControls';
import {initialDraft} from '@/app/dev/session-builder-prototype/model';

beforeAll(()=>{
 Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.setAttribute('open','');}});
 Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.removeAttribute('open');}});
});

test('changing interface locale preserves a language search and emits stable language/source values',()=>{
 const onApply=vi.fn();
 const view=render(<BuilderScopePicker page="language" draft={initialDraft} onApply={onApply} interfaceLanguage="en"/>);
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'nl'}});
 view.rerender(<BuilderScopePicker page="language" draft={initialDraft} onApply={onApply} interfaceLanguage="ru"/>);
 expect(screen.getByRole('textbox',{name:'Поиск изучаемых языков'})).toHaveValue('nl');
 expect(screen.getByRole('button',{name:/нидерландский/i})).toHaveAttribute('aria-pressed','true');
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'английский'}});
 fireEvent.click(screen.getByRole('button',{name:/английский/i}));
 expect(onApply).toHaveBeenLastCalledWith({language:'English',source:'english-core',parts:[],article:null});
 view.rerender(<BuilderScopePicker key="source" page="source" draft={initialDraft} onApply={onApply} interfaceLanguage="nl"/>);
 fireEvent.click(screen.getByRole('button',{name:'Woordenboeken'}));
 fireEvent.click(screen.getByRole('button',{name:/Dutch dictionary/}));
 expect(onApply).toHaveBeenLastCalledWith({source:'all'});
});

test('localized direction controls keep direction IDs and content language',()=>{
 const onChange=vi.fn();
 render(<InterfaceLanguageContext.Provider value="ru"><Directions values={['Direct']} pair={['fiets','een voertuig']} contentLanguage="nl" onChange={onChange}/></InterfaceLanguageContext.Provider>);
 fireEvent.click(screen.getByRole('button',{name:/Обратный/}));
 expect(onChange).toHaveBeenCalledWith(['Direct','Reverse']);
 expect(screen.getAllByText('fiets')[0]).toHaveAttribute('lang','nl');
});

test('sentence translation notices use interface locale while samples retain their language',()=>{
 const view=render(<InterfaceLanguageContext.Provider value="ru"><TranslationDirectionPreview from="Off" to="Dutch"/></InterfaceLanguageContext.Provider>);
 expect(screen.getByText(/Выберите язык перевода в настройках/)).toBeInTheDocument();
 view.rerender(<InterfaceLanguageContext.Provider value="ru"><TranslationDirectionPreview from="English" to="Dutch"/></InterfaceLanguageContext.Provider>);
 expect(screen.getByText('I cycle to work.')).toHaveAttribute('lang','en');
 expect(screen.getByText('Ik ga met de fiets naar mijn werk.')).toHaveAttribute('lang','nl');
 expect(screen.getByLabelText(/Перевод предложений:/)).toHaveTextContent('нидерландский');
});

test('delete dialog localizes user-visible copy and keeps a custom training name intact',()=>{
 const onDelete=vi.fn();
 render(<InterfaceLanguageContext.Provider value="ru"><SavedTrainingControls name="My exact title" main hasOthers onMain={()=>{}} onDelete={onDelete}/></InterfaceLanguageContext.Provider>);
 fireEvent.click(screen.getByRole('button',{name:'Удалить тренировку'}));
 const dialog=screen.getByRole('dialog',{name:'Удалить тренировку?'});
 expect(dialog).toHaveAttribute('lang','ru');
 expect(dialog).toHaveTextContent('«My exact title»');
 expect(screen.getByRole('button',{name:'Отмена'})).toHaveFocus();
 fireEvent.click(screen.getAllByRole('button',{name:'Удалить тренировку'})[1]);
 expect(onDelete).toHaveBeenCalledOnce();
});
