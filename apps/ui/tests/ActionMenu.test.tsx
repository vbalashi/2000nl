import React from 'react';
import {afterEach,expect,test,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {ActionMenu} from '@/components/practice/ui/ActionMenu';
const originalShow=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'showPopover');
const originalHide=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'hidePopover');
afterEach(()=>{
 cleanup();vi.restoreAllMocks();
 for(const [key,descriptor] of [['showPopover',originalShow],['hidePopover',originalHide]] as const){
  if(descriptor)Object.defineProperty(HTMLElement.prototype,key,descriptor);
  else delete (HTMLElement.prototype as unknown as Record<string,unknown>)[key];
 }
});

test('an open menu preserves its popover and focus through capability and callback updates',()=>{
 const anchor=document.createElement('button');document.body.append(anchor);
 const show=vi.fn(),hide=vi.fn(),firstClose=vi.fn(),latestClose=vi.fn(),select=vi.fn();
 Object.defineProperty(HTMLElement.prototype,'showPopover',{configurable:true,value:show});
 Object.defineProperty(HTMLElement.prototype,'hidePopover',{configurable:true,value:hide});
 const items=[{id:'first',label:'First',onSelect:select},{id:'second',label:'Second',onSelect:select}];
 const view=render(<ActionMenu anchor={anchor} title="Actions" language="en" items={items} onClose={firstClose}/>);
 const menu=screen.getByRole('menu');
 fireEvent.keyDown(menu,{key:'End'});
 expect(screen.getByRole('menuitem',{name:'Second'})).toHaveFocus();
 view.rerender(<ActionMenu anchor={anchor} title="Actions" language="en" items={items.map(item=>({...item,disabled:true}))} onClose={latestClose}/>);
 fireEvent.click(screen.getByRole('menuitem',{name:'First'}));
 expect(select).not.toHaveBeenCalled();
 view.rerender(<ActionMenu anchor={anchor} title="Actions" language="en" items={items.map(item=>({...item,description:'Updated explanation'}))} onClose={latestClose}/>);
 expect(screen.getByRole('menuitem',{name:'Second'})).toHaveFocus();
 expect(show).toHaveBeenCalledOnce();expect(hide).not.toHaveBeenCalled();
 fireEvent(window,new Event('resize'));
 expect(latestClose).toHaveBeenCalledOnce();expect(firstClose).not.toHaveBeenCalled();
 view.unmount();expect(hide).toHaveBeenCalledOnce();anchor.remove();
});
