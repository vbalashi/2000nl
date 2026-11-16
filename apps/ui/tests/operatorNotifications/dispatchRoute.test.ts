import { afterEach, expect, test, vi } from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),dispatch:vi.fn()}));
vi.mock('@/lib/admin/adminServerClient',()=>({createAdminServiceClient:()=>({rpc:mocks.rpc})}));
vi.mock('@/lib/operatorNotifications/dispatch',()=>({dispatchOne:mocks.dispatch}));
import { GET, POST } from '@/app/api/operator-notifications/dispatch/route';
const request=(method:string,secret:string)=>new Request('http://localhost/api/operator-notifications/dispatch',{method,headers:{authorization:`Bearer ${secret}`}});
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();});
test('queue status requires the dispatcher secret and does not expose error details',async()=>{
 vi.stubEnv('OPERATOR_NOTIFICATION_DISPATCH_SECRET','x'.repeat(40));
 expect((await GET(request('GET','wrong'))).status).toBe(401);
 expect(mocks.rpc).not.toHaveBeenCalled();
 mocks.rpc.mockResolvedValueOnce({data:{pending:2,leased:0,failed:1,oldestPendingAt:'2026-01-01T00:00:00Z'},error:null});
 const response=await GET(request('GET','x'.repeat(40)));
 expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');
 expect(await response.json()).toMatchObject({pending:2,failed:1});
 mocks.rpc.mockResolvedValueOnce({error:{message:'sensitive'},data:null});
 expect(await (await GET(request('GET','x'.repeat(40)))).json()).toEqual({error:'unavailable'});
});
test('delivery retains secret protection',async()=>{
 vi.stubEnv('OPERATOR_NOTIFICATION_DISPATCH_SECRET','x'.repeat(40));
 expect((await POST(request('POST','wrong'))).status).toBe(401);
 mocks.dispatch.mockResolvedValueOnce('idle');expect(await (await POST(request('POST','x'.repeat(40)))).json()).toEqual({status:'idle'});
});
