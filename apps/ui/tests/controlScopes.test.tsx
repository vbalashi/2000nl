import React from 'react';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,beforeAll,expect,test,vi} from 'vitest';
import {LanguageScopeControl} from '@/components/practice/ui/LanguageScopeControl';
import {StatisticsMaterialPicker} from '@/components/practice/statistics/StatisticsScope';
afterEach(cleanup);
beforeAll(()=>{Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(){this.setAttribute('open','');}});});
const languages=['Dutch','English','German','French','Spanish'].map(id=>({id,label:id}));
test.each([1,2,4])('%s languages fitting the desktop need no overflow trigger',count=>{
 render(<LanguageScopeControl label="Languages" menuLabel="More languages" language="en" options={languages.slice(0,count)} value="Dutch" onChange={vi.fn()}/>);
 expect(screen.queryByRole('button',{name:'More languages'})).toBeNull();
 expect(screen.getAllByRole('button')).toHaveLength(count);
});
test('overflow selection stays visible and can be re-enabled after selecting another language',()=>{
 const change=vi.fn();const props={label:'Languages',menuLabel:'More languages',language:'en',options:languages,onChange:change};
 const view=render(<LanguageScopeControl {...props} value="Dutch"/>);
 fireEvent.click(screen.getByRole('button',{name:'More languages'}));
 fireEvent.click(screen.getByRole('menuitem',{name:'Spanish'}));expect(change).toHaveBeenLastCalledWith('Spanish');
 view.rerender(<LanguageScopeControl {...props} value="Spanish"/>);
 expect(screen.getByRole('button',{name:'Spanish'})).toHaveAttribute('aria-pressed','true');
 view.rerender(<LanguageScopeControl {...props} value="Dutch"/>);
 fireEvent.click(screen.getByRole('button',{name:'Spanish'}));expect(change).toHaveBeenLastCalledWith('Spanish');
});
test('material All is distinct from a remembered dictionary or collection',()=>{
 const change=vi.fn();const props={compact:true,interfaceLanguage:'en' as const,languageLabel:'Dutch',options:[{id:'all',label:'All'},{id:'dictionary',label:'Dictionary'},{id:'collection',label:'Collection'}],onChange:change};
 const view=render(<StatisticsMaterialPicker {...props} value="all"/>);
 expect(screen.queryByRole('button',{name:'Current language'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Choose training material'}));
 fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Collection'}));expect(change).toHaveBeenLastCalledWith('collection');
 view.rerender(<StatisticsMaterialPicker {...props} value="all"/>);
 fireEvent.click(screen.getByRole('button',{name:'Collection'}));expect(change).toHaveBeenLastCalledWith('collection');
 fireEvent.click(screen.getByRole('button',{name:'All'}));expect(change).toHaveBeenLastCalledWith('all');
});
