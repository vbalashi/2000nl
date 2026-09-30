import React from 'react';
import {fireEvent,render,screen} from '@testing-library/react';
import {beforeAll,expect,test,vi} from 'vitest';
import {SettingsPrototype} from '@/app/dev/session-builder-prototype/SettingsPrototype';
import {LanguagePicker} from '@/app/dev/session-builder-prototype/LanguagePicker';
import {InterfaceLanguageContext} from '@/app/dev/session-builder-prototype/VariantControls';
import {formatUiCount,getUiMessages} from '@/lib/uiMessages';
import type {OnboardingLanguage} from '@/lib/onboardingI18n';

vi.mock('@/app/dev/session-builder-prototype/LibraryArticle',()=>({LibraryArticle:()=> <div>Dictionary preview</div>}));
beforeAll(()=>{
 Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.setAttribute('open','');}});
 Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.removeAttribute('open');}});
 vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
});
function props(locale:OnboardingLanguage){return {interfaceLanguage:locale,onInterfaceLanguageChange:vi.fn(),translation:'Off',setTranslation:vi.fn(),textSize:{size:'standard' as const,device:'phone' as const,ready:true,stored:true,setSize:vi.fn()},resolvedDark:false,palette:'lavender' as const,onPaletteChange:vi.fn(),mode:'Light' as const,onModeChange:vi.fn(),active:true,onExit:vi.fn()};}
function section(name:string){fireEvent.click(screen.getAllByRole('button',{name})[0]);}

test('locale changes preserve paused languages, order, dictionary switches and the selected section',()=>{
 const base=props('en');const view=render(<SettingsPrototype {...base}/>);
 fireEvent.click(screen.getByRole('switch',{name:'Study German'}));
 fireEvent.click(screen.getByRole('button',{name:'Move English up'}));
 view.rerender(<SettingsPrototype {...base} interfaceLanguage="ru"/>);
 expect(screen.getByRole('switch',{name:'Изучать: немецкий'})).toHaveAttribute('aria-checked','false');
 expect(screen.getByRole('button',{name:'Переместить выше: английский'})).toBeDisabled();
 fireEvent.click(screen.getByRole('switch',{name:'Изучать: английский'}));
 expect(screen.getByRole('switch',{name:'Изучать: нидерландский'})).toBeDisabled();
 section('Словари');
 const dictionary=screen.getByRole('switch',{name:'Использовать VanDale NT2: нидерландский'});
 fireEvent.click(dictionary);
 view.rerender(<SettingsPrototype {...base} interfaceLanguage="nl"/>);
 expect(screen.getByRole('switch',{name:'Gebruik VanDale NT2 (Nederlands)'})).toHaveAttribute('aria-checked','false');
});

test('translated appearance labels emit canonical palette, mode and text-size values',()=>{
 const base=props('ru');render(<SettingsPrototype {...base}/>);section('Оформление');
 fireEvent.click(screen.getByRole('button',{name:'Тёмная'}));
 expect(base.onModeChange).toHaveBeenCalledWith('Dark');
 fireEvent.click(screen.getByRole('button',{name:/Синяя/}));
 expect(base.onPaletteChange).toHaveBeenCalledWith('blue');
 fireEvent.click(screen.getByRole('button',{name:'Очень крупный'}));
 expect(base.textSize.setSize).toHaveBeenCalledWith('extra');
});

test('picker preserves its query across locale changes, searches translated names and returns canonical names',()=>{
 const choose=vi.fn(),close=vi.fn();
 const view=render(<InterfaceLanguageContext.Provider value="en"><LanguagePicker title="Choose" onChoose={choose} onClose={close}/></InterfaceLanguageContext.Provider>);
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'Nederlands'}});
 view.rerender(<InterfaceLanguageContext.Provider value="ru"><LanguagePicker title="Выбор" onChoose={choose} onClose={close}/></InterfaceLanguageContext.Provider>);
 expect(screen.getByRole('textbox',{name:'Поиск языков'})).toHaveValue('Nederlands');
 fireEvent.click(screen.getByRole('button',{name:/^нидерландский.*nl$/i}));
 expect(choose).toHaveBeenCalledWith('Dutch');expect(close).toHaveBeenCalledOnce();
});

test('inventory count nouns and numbers follow locale plural rules',()=>{
 const ru=getUiMessages('ru').settings;
 expect(formatUiCount('ru',1,ru,'entry')).toBe('1 запись');
 expect(formatUiCount('ru',24,ru,'entry')).toBe('24 записи');
 expect(formatUiCount('ru',72,ru,'expression')).toBe('72 выражения');
 expect(formatUiCount('nl',2000,getUiMessages('nl').settings,'entry')).toBe('2.000 vermeldingen');
});
