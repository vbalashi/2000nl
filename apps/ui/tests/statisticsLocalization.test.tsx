import React from 'react';
import {fireEvent,render,screen,within} from '@testing-library/react';
import {beforeEach,expect,test,vi} from 'vitest';
import {StatisticsPrototype} from '@/app/dev/session-builder-prototype/StatisticsPrototype';
import {InterfaceLanguageContext} from '@/app/dev/session-builder-prototype/VariantControls';
import {getUiMessages,formatUiCount} from '@/lib/uiMessages';

beforeEach(()=>{
 Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.setAttribute('open','');}});
 Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.removeAttribute('open');}});
});

test('locale changes preserve period, language, scope, selected day and canonical training callback',()=>{
 const train=vi.fn();const history=vi.fn();
 const view=render(<InterfaceLanguageContext.Provider value="en"><StatisticsPrototype onTrain={train} onHistory={history}/></InterfaceLanguageContext.Provider>);
 fireEvent.click(screen.getByRole('button',{name:'German'}));
 fireEvent.click(screen.getByRole('button',{name:'Month'}));
 fireEvent.click(screen.getByRole('button',{name:'Choose training material'}));
 fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:/Idioms/}));
 const day=screen.getAllByRole('button',{name:/September 28, 2026:/})[0];fireEvent.click(day);
 const value=screen.getByRole('progressbar').getAttribute('aria-valuenow');
 view.rerender(<InterfaceLanguageContext.Provider value="ru"><StatisticsPrototype onTrain={train} onHistory={history}/></InterfaceLanguageContext.Provider>);
 expect(screen.getByRole('button',{name:'немецкий'})).toHaveAttribute('aria-pressed','true');
 expect(screen.getByRole('button',{name:'Месяц'})).toHaveAttribute('aria-pressed','true');
 expect(screen.getByRole('button',{name:'Идиомы'})).toHaveAttribute('aria-pressed','true');
 expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow',value!);
 expect(screen.getAllByRole('button',{name:/28 сентября 2026.*:/})[0]).toHaveAttribute('aria-pressed','true');
 fireEvent.click(screen.getByRole('button',{name:'Тренировать: Идиомы'}));expect(train).toHaveBeenCalledWith('German · Idioms');
 fireEvent.click(screen.getByRole('button',{name:'Последние действия'}));expect(history).toHaveBeenCalledOnce();
});

test('open material selection and other-language value survive locale changes',()=>{
 const train=vi.fn();const view=render(<InterfaceLanguageContext.Provider value="en"><StatisticsPrototype onTrain={train}/></InterfaceLanguageContext.Provider>);
 fireEvent.click(screen.getByRole('button',{name:'French'}));
 fireEvent.click(screen.getByRole('button',{name:'Choose training material'}));
 view.rerender(<InterfaceLanguageContext.Provider value="nl"><StatisticsPrototype onTrain={train}/></InterfaceLanguageContext.Provider>);
 expect(screen.getByRole('button',{name:'Frans'})).toHaveAttribute('aria-pressed','true');
 const dialog=screen.getByRole('dialog',{name:'Kies materiaal'});
 fireEvent.click(within(dialog).getByRole('button',{name:/Uitdrukkingen en vaste verbindingen/}));
 fireEvent.click(screen.getByRole('button',{name:'Uitdrukkingen oefenen'}));expect(train).toHaveBeenCalledWith('French · Idioms');
});

test('empty activity stays empty when locale changes; counts and dates follow locale',()=>{
 const view=render(<InterfaceLanguageContext.Provider value="en"><StatisticsPrototype onTrain={vi.fn()}/></InterfaceLanguageContext.Provider>);
 fireEvent.click(screen.getByRole('button',{name:'First visit'}));
 view.rerender(<InterfaceLanguageContext.Provider value="ru"><StatisticsPrototype onTrain={vi.fn()}/></InterfaceLanguageContext.Provider>);
 expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow','0');
 expect(screen.getByText('0 карточек для повторения')).toBeInTheDocument();
 expect(screen.getByText(/из 2\s480 карточек начато/)).toBeInTheDocument();
 fireEvent.click(screen.getAllByRole('button',{name:/28 сентября 2026.*:/})[0]);
 expect(screen.getByText(/Нет записей об активности/)).toBeInTheDocument();
 expect(formatUiCount('ru',1,getUiMessages('ru').statistics,'day')).toBe('1 день');
 expect(formatUiCount('ru',2,getUiMessages('ru').statistics,'ready')).toBe('2 карточки для повторения');
 expect(formatUiCount('ru',5,getUiMessages('ru').statistics,'day')).toBe('5 дней');
});
