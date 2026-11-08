import React from 'react';
import {expect,test,vi} from 'vitest';
import {fireEvent,render,screen} from '@testing-library/react';
import {SettingsHelp} from '@/components/practice/settings/SettingsHelp';

test('Escape closes an open explanation without dismissing the containing editor',()=>{
 const dismiss=vi.fn();
 render(<div onKeyDown={event=>{if(event.key==='Escape')dismiss();}}><SettingsHelp label="Read only" text="Only the author can edit."/></div>);
 const button=screen.getByRole('button',{name:'? Read only'});
 fireEvent.click(button);expect(button).toHaveAttribute('aria-expanded','true');
 fireEvent.keyDown(button,{key:'Escape'});
 expect(button).toHaveAttribute('aria-expanded','false');expect(dismiss).not.toHaveBeenCalled();
 fireEvent.keyDown(button,{key:'Escape'});expect(dismiss).toHaveBeenCalledOnce();
});
