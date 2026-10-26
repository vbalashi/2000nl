import React from 'react';
import {render,screen} from '@testing-library/react';
import {afterEach,expect,test,vi} from 'vitest';
Object.assign(globalThis,{React});
vi.mock('@/app/HomePage',()=>({default:({invitationCode}:{invitationCode:string|null})=><div data-testid="normal-auth-app" data-code={invitationCode??''}/> }));
import {ShareLanding} from '@/app/share/ShareLanding';
afterEach(()=>{window.history.replaceState(null,'','/');window.sessionStorage.clear();vi.restoreAllMocks();});
const code='A'.repeat(26);
test('scrubs fragment before mounting existing auth app and preserves invitation across login',()=>{
 window.history.replaceState(null,'',`/share#${code}`);
 render(<React.StrictMode><ShareLanding/></React.StrictMode>);
 expect(window.location.pathname).toBe('/share');expect(window.location.hash).toBe('');
 expect(screen.getByTestId('normal-auth-app')).toHaveAttribute('data-code',code);
 expect(window.sessionStorage.getItem('2000nl.pending-share-invitation.v1')).toContain(code);
});
test('blocked storage retains the in-memory invitation without forwarding it in the URL',()=>{
 window.history.replaceState(null,'',`/share#${code}`);vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('denied');});
 render(<ShareLanding/>);expect(window.location.hash).toBe('');expect(screen.getByTestId('normal-auth-app')).toHaveAttribute('data-code',code);
});
test('malformed fragment leaves no code in the URL or app',()=>{
 window.sessionStorage.setItem('2000nl.pending-share-invitation.v1',JSON.stringify({code,capturedAt:Date.now()}));
 window.history.replaceState(null,'','/share#not-a-code');render(<ShareLanding/>);
 expect(window.sessionStorage.getItem('2000nl.pending-share-invitation.v1')).toBeNull();
 expect(window.location.href).not.toContain('not-a-code');expect(screen.getByTestId('normal-auth-app')).toHaveAttribute('data-code','');
});
test('scrubbed share reload permits account-scoped resume instead of explicit invalid-link intake',()=>{
 window.history.replaceState(null,'','/share');render(<ShareLanding/>);
 expect(window.location.pathname).toBe('/share');expect(screen.getByTestId('normal-auth-app')).toBeInTheDocument();
});
