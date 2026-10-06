import React,{useState} from 'react';
import {afterEach,expect,test,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {TrainingScreenTransition} from '@/components/training/pilot/TrainingScreenTransition';
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
function Fixture(){const [page,setPage]=useState<'today'|'setup'>('today');return <TrainingScreenTransition screen={page}>{page==='today'?<button onClick={()=>setPage('setup')}>Edit saved</button>:<button onClick={()=>setPage('today')}>Back</button>}</TrainingScreenTransition>}
test('outgoing screen stays until 100ms, returning restores initiating focus',()=>{vi.useFakeTimers();vi.stubGlobal('matchMedia',()=>({matches:false}));render(<Fixture/>);fireEvent.click(screen.getByRole('button',{name:'Edit saved'}));expect(screen.queryByRole('button',{name:'Back'})).toBeNull();act(()=>vi.advanceTimersByTime(100));expect(screen.getByRole('button',{name:'Back'})).toBeInTheDocument();act(()=>vi.advanceTimersByTime(180));fireEvent.click(screen.getByRole('button',{name:'Back'}));act(()=>vi.advanceTimersByTime(100));expect(screen.getByRole('button',{name:'Edit saved'})).toHaveFocus();act(()=>vi.advanceTimersByTime(180));});
test('reduced motion switches immediately',()=>{vi.stubGlobal('matchMedia',()=>({matches:true}));render(<Fixture/>);fireEvent.click(screen.getByRole('button',{name:'Edit saved'}));expect(screen.getByRole('button',{name:'Back'})).toBeInTheDocument();});
