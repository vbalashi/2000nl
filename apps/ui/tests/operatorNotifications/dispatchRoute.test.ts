import { afterEach, expect, test, vi } from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),dispatch:vi.fn()}));
vi.mock('@/lib/admin/adminServerClient',()=>({createAdminServiceClient:()=>({rpc:mocks.rpc})}));
vi.mock('@/lib/operatorNotifications/dispatch',()=>({dispatchOne:mocks.dispatch}));
import { DELETE, GET, POST } from '@/app/api/operator-notifications/dispatch/route';
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

test('retention cleanup is authenticated and redacts provider failures',async()=>{
 vi.stubEnv('OPERATOR_NOTIFICATION_DISPATCH_SECRET','x'.repeat(40));
 expect((await DELETE(request('DELETE','wrong'))).status).toBe(401);expect(mocks.rpc).not.toHaveBeenCalled();
 mocks.rpc.mockResolvedValueOnce({data:2,error:null});
 expect(await (await DELETE(request('DELETE','x'.repeat(40)))).json()).toEqual({removed:2});
 mocks.rpc.mockResolvedValueOnce({data:null,error:{message:'private'}});
 expect(await (await DELETE(request('DELETE','x'.repeat(40)))).json()).toEqual({error:'unavailable'});
});

test('status key is independently rotated, read-only, and projects only aggregate data',async()=>{
 const dispatch='d'.repeat(40),status='s'.repeat(40),next='n'.repeat(40);
 vi.stubEnv('OPERATOR_NOTIFICATION_DISPATCH_SECRET',dispatch);vi.stubEnv('OPERATOR_NOTIFICATION_STATUS_SECRET',status);
 mocks.rpc.mockResolvedValue({data:{pending:2,leased:1,failed:0,oldestPendingAt:null,private:'must not escape'},error:null});
 expect(await (await GET(request('GET',status))).json()).toEqual({pending:2,leased:1,failed:0,oldestPendingAt:null});
 mocks.rpc.mockClear();
 expect((await POST(request('POST',status))).status).toBe(401);
 expect((await DELETE(request('DELETE',status))).status).toBe(401);
 expect(mocks.dispatch).not.toHaveBeenCalled();expect(mocks.rpc).not.toHaveBeenCalled();
 vi.stubEnv('OPERATOR_NOTIFICATION_STATUS_SECRET',next);
 expect((await GET(request('GET',status))).status).toBe(401);
 expect((await GET(request('GET',next))).status).toBe(200);
 expect((await GET(request('GET',dispatch))).status).toBe(200);
});

test('status key fails closed for missing, malformed or equal credentials',async()=>{
 const key='d'.repeat(40);vi.stubEnv('OPERATOR_NOTIFICATION_DISPATCH_SECRET',key);
 vi.stubEnv('OPERATOR_NOTIFICATION_STATUS_SECRET','short');
 expect((await GET(request('GET','short'))).status).toBe(401);
 vi.stubEnv('OPERATOR_NOTIFICATION_STATUS_SECRET',key);
 for(const [method,handler] of [['GET',GET],['POST',POST],['DELETE',DELETE]] as const) expect((await handler(request(method,key))).status).toBe(401);
 expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.dispatch).not.toHaveBeenCalled();
 vi.stubEnv('OPERATOR_NOTIFICATION_DISPATCH_SECRET','');vi.stubEnv('OPERATOR_NOTIFICATION_STATUS_SECRET','s'.repeat(40));
 expect((await GET(request('GET','s'.repeat(40)))).status).toBe(401);
});

test('malformed aggregate fails without exposing RPC data',async()=>{
 vi.stubEnv('OPERATOR_NOTIFICATION_DISPATCH_SECRET','d'.repeat(40));
 mocks.rpc.mockResolvedValue({data:{pending:2,leased:0,failed:-1,oldestPendingAt:null,private:'secret'},error:null});
 const response=await GET(request('GET','d'.repeat(40)));
 expect(response.status).toBe(503);expect(await response.json()).toEqual({error:'unavailable'});
});

test('unknown and revoked status credentials are denied before database access',async()=>{
 const dispatch='d'.repeat(40),status='s'.repeat(40);
 vi.stubEnv('OPERATOR_NOTIFICATION_DISPATCH_SECRET',dispatch);vi.stubEnv('OPERATOR_NOTIFICATION_STATUS_SECRET',status);
 expect((await GET(request('GET','u'.repeat(40)))).status).toBe(401);
 vi.stubEnv('OPERATOR_NOTIFICATION_STATUS_SECRET','');
 expect((await GET(request('GET',status))).status).toBe(401);
 expect(mocks.rpc).not.toHaveBeenCalled();
});

test('Telegram scope also limits queue status and retention',async()=>{
 const secret='d'.repeat(40);
 vi.stubEnv('OPERATOR_NOTIFICATION_DISPATCH_SECRET',secret);
 vi.stubEnv('OPERATOR_NOTIFICATION_DISPATCH_TRANSPORT','telegram');
 mocks.rpc.mockResolvedValueOnce({data:{pending:1,leased:0,failed:0,oldestPendingAt:null},error:null});
 expect((await GET(request('GET',secret))).status).toBe(200);
 mocks.rpc.mockResolvedValueOnce({data:1,error:null});
 expect(await (await DELETE(request('DELETE',secret))).json()).toEqual({removed:1});
 expect(mocks.rpc.mock.calls.map(([rpc])=>rpc)).toEqual([
  'operator_telegram_notification_status_v1','operator_telegram_notification_cleanup_v1',
 ]);
});
