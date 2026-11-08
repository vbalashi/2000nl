import React from 'react';
import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {DateField} from '@/components/practice/ui/DateField';
const labels={previousMonth:'Previous month',nextMonth:'Next month',clear:'Clear',cancel:'Cancel',year:'Year'};
beforeEach(()=>{
 vi.spyOn(HTMLDialogElement.prototype,'showModal').mockImplementation(function(this:HTMLDialogElement){this.open=true;});
 vi.spyOn(HTMLDialogElement.prototype,'close').mockImplementation(function(this:HTMLDialogElement){this.open=false;});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
test('uses a localized calendar with keyboard month-boundary navigation and ISO output',()=>{
 const change=vi.fn();render(<DateField label="Publication date" value="2026-01-31" onChange={change} locale="en" labels={labels}/>);
 const trigger=screen.getByRole('button',{name:'Publication date Jan 31, 2026'});trigger.focus();fireEvent.click(trigger);
 const current=screen.getByRole('button',{name:'Saturday, January 31, 2026'});expect(current).toHaveFocus();
 fireEvent.keyDown(current,{key:'ArrowRight'});
 const next=screen.getByRole('button',{name:'Sunday, February 1, 2026'});expect(next).toHaveFocus();fireEvent.click(next);
 expect(change).toHaveBeenCalledWith('2026-02-01');expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(trigger).toHaveFocus();
});
test('clear removes an optional date; Escape cancels without changing the value',()=>{
 const change=vi.fn();render(<DateField label="Date" value="2026-01-01" onChange={change} locale="nl" labels={labels}/>);
 fireEvent.click(screen.getByRole('button',{name:/Date/}));fireEvent.click(screen.getByRole('button',{name:'Clear'}));expect(change).toHaveBeenCalledWith('');
 fireEvent.click(screen.getByRole('button',{name:/Date/}));fireEvent(screen.getByRole('dialog'),new Event('cancel',{bubbles:true,cancelable:true}));expect(change).toHaveBeenCalledTimes(1);expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
test('year editing permits an arbitrary older publication without stealing typing focus',()=>{
 const change=vi.fn();render(<DateField label="Date" value="2026-01-31" onChange={change} locale="uk" labels={labels}/>);
 fireEvent.click(screen.getByRole('button',{name:/Date/}));const year=screen.getByRole('spinbutton',{name:'Year'});year.focus();fireEvent.change(year,{target:{value:'1945'}});expect(year).toHaveFocus();fireEvent.blur(year);
 const target=screen.getByRole('button',{name:new Intl.DateTimeFormat('uk',{dateStyle:'full',timeZone:'UTC'}).format(new Date('1945-01-31T12:00:00Z'))});fireEvent.click(target);expect(change).toHaveBeenCalledWith('1945-01-31');
});
test('calendar controls cannot submit the containing form',()=>{
 const submit=vi.fn(event=>event.preventDefault());render(<form onSubmit={submit}><DateField label="Date" value="2026-01-01" onChange={()=>{}} locale="ru" labels={labels}/></form>);
 fireEvent.click(screen.getByRole('button',{name:/Date/}));fireEvent.click(screen.getByRole('button',{name:'Next month'}));fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(submit).not.toHaveBeenCalled();
});
