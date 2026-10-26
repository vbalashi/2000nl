import React from 'react';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,expect,test,vi} from 'vitest';
import {CorruptLocalRecovery} from '@/components/library/sharing/CorruptLocalRecovery';
const props={scopeKey:'account/collection',storageKey:'corrupt-test',valid:()=>false,verify:vi.fn(async(_signal:AbortSignal)=>{}),trigger:'ready',locale:'en' as const,onClose:vi.fn(),onReset:vi.fn()};
beforeEach(()=>{sessionStorage.clear();sessionStorage.setItem(props.storageKey,'broken');vi.clearAllMocks();props.verify.mockResolvedValue();});
test('automatically reads but only explicit cleanup clears local data and never resends',async()=>{
 render(<CorruptLocalRecovery {...props}/>);await waitFor(()=>expect(screen.getByRole('button',{name:'Clear local record'})).toBeEnabled());expect(props.verify).toHaveBeenCalledOnce();expect(sessionStorage.getItem(props.storageKey)).toBe('broken');expect(props.onReset).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Clear local record'}));expect(sessionStorage.getItem(props.storageKey)).toBeNull();expect(props.onReset).toHaveBeenCalledOnce();
});
test('failed automatic check only offers read-only retry, not cleanup',async()=>{
 props.verify.mockRejectedValueOnce(Error('offline'));render(<CorruptLocalRecovery {...props}/>);fireEvent.click(await screen.findByRole('button',{name:'Retry'}));await screen.findByRole('button',{name:'Clear local record'});expect(props.verify).toHaveBeenCalledTimes(2);expect(sessionStorage.getItem(props.storageKey)).toBe('broken');expect(props.onReset).not.toHaveBeenCalled();
});
test('account change aborts check and hides old local bytes immediately',async()=>{
 let settle!:()=>void;props.verify.mockReturnValueOnce(new Promise<void>(resolve=>settle=resolve));const view=render(<CorruptLocalRecovery {...props}/>);const signal=props.verify.mock.calls[0][0];sessionStorage.setItem('other','valid');view.rerender(<CorruptLocalRecovery {...props} scopeKey="other-account" storageKey="other" valid={()=>true}/>);expect(signal.aborted).toBe(true);await act(async()=>settle());expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(sessionStorage.getItem(props.storageKey)).toBe('broken');
});

test('storage getter denial at explicit cleanup becomes an error without uncaught failure',async()=>{
 render(<CorruptLocalRecovery {...props}/>);await screen.findByRole('button',{name:'Clear local record'});
 const getter=vi.spyOn(window,'sessionStorage','get').mockImplementation(()=>{throw Error('denied');});
 try{fireEvent.click(screen.getByRole('button',{name:'Clear local record'}));expect(await screen.findByRole('button',{name:'Retry'})).toBeInTheDocument();expect(props.onReset).not.toHaveBeenCalled();}finally{getter.mockRestore();}
});
