import React from 'react';
import {fireEvent,render,screen} from '@testing-library/react';
import {expect,test,vi} from 'vitest';
import {InvitationInput} from '@/components/library/sharing/InvitationInput';
test('pasted link resolves to the same code without navigation or acceptance',()=>{
 const submit=vi.fn(),code='A'.repeat(26);render(<InvitationInput locale="en" onSubmit={submit} onCancel={()=>{}}/>);
 fireEvent.change(screen.getByRole('textbox'),{target:{value:`${window.location.origin}/share#${code}`}});fireEvent.click(screen.getByRole('button',{name:'Check invitation'}));expect(submit).toHaveBeenCalledWith(code);
});
test('external link stays on the input with a visible validation error',()=>{
 const submit=vi.fn();render(<InvitationInput locale="en" onSubmit={submit} onCancel={()=>{}}/>);fireEvent.change(screen.getByRole('textbox'),{target:{value:`https://evil.test/share#${'A'.repeat(26)}`}});fireEvent.click(screen.getByRole('button',{name:'Check invitation'}));expect(screen.getByRole('alert')).toBeInTheDocument();expect(submit).not.toHaveBeenCalled();
});

test('guided example starts filled and readonly, and still requires checking the invitation',()=>{
 const submit=vi.fn(),code='1'.repeat(26);render(<InvitationInput locale="en" initialValue={code} readOnly onSubmit={submit} onCancel={()=>{}}/>);
 expect(screen.getByRole('textbox')).toHaveValue(code);expect(screen.getByRole('textbox')).toHaveAttribute('readonly');expect(submit).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Check invitation'}));expect(submit).toHaveBeenCalledWith(code);
});
