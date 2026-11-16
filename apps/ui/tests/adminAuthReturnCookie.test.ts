import {beforeEach,expect,it,vi} from 'vitest';
const {store}=vi.hoisted(()=>({store:{getAll:vi.fn(),set:vi.fn()}}));
vi.mock('server-only',()=>({}));vi.mock('next/headers',()=>({cookies:async()=>store}));
import {consumeAdminReturnUrl,storeAdminReturn} from '@/lib/admin/adminAuthReturn';
const origin='https://app.example.test',path='/admin/reports/?feedback=11111111-1111-4111-8111-111111111111';
beforeEach(()=>{vi.clearAllMocks();store.getAll.mockReturnValue([]);});
// Next redirects the browser's trailing-slash link before the login link records it.
it.each([path,path.replace('/reports/','/reports'),'/admin/reports?view=notifications'])('preserves validated browser destination %s across a mail tab',async target=>{await storeAdminReturn(target,origin);expect(store.set).toHaveBeenCalledWith('2000nl-admin-return',target,expect.objectContaining({httpOnly:true,sameSite:'lax',maxAge:3600}));store.getAll.mockReturnValue([{name:'2000nl-admin-return',value:target}]);const result=new URL(await consumeAdminReturnUrl(origin),origin);expect(result.pathname).toBe('/admin');expect(result.searchParams.get('returnTo')).toBe(target);expect(store.set).toHaveBeenLastCalledWith('2000nl-admin-return','',expect.objectContaining({maxAge:0}));});
it.each(['https://evil.test/admin/reports/','//evil.test/admin/reports/','/api/admin/users','/admin/reports/../users'])('does not store an external or unrelated destination %s',async value=>{await storeAdminReturn(value,origin);expect(store.set).toHaveBeenCalledWith('2000nl-admin-return','',expect.objectContaining({maxAge:0}));store.getAll.mockReturnValue([{name:'2000nl-admin-return',value}]);expect(await consumeAdminReturnUrl(origin)).toBe('/admin');});
