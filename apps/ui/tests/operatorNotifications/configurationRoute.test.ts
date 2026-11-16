import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),auth:vi.fn()}));
vi.mock('@/lib/admin/adminAccess',()=>({requireAdmin:mocks.auth,adminErrorResponse:()=>new Response(JSON.stringify({error:'unavailable'}),{status:503})}));
vi.mock('@/lib/admin/adminServerClient',()=>({createAdminServiceClient:()=>({rpc:mocks.rpc})}));
import {GET,POST,PUT} from '@/app/api/admin/notifications/route';
const request=(body:unknown,origin='https://example.test')=>new Request('https://example.test/api/admin/notifications',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
beforeEach(()=>{vi.stubEnv('ADMIN_SITE_URL','https://example.test');mocks.rpc.mockReset();mocks.auth.mockReset().mockResolvedValue({userId:'operator',requestId:'request'});});
afterEach(()=>{vi.unstubAllEnvs();});
test('requires the dedicated permission before accessing configuration',async()=>{
 mocks.rpc.mockResolvedValue({data:{bots:[],routes:[]},error:null});
 const response=await GET(new Request('https://example.test/api/admin/notifications'));
 expect(mocks.auth).toHaveBeenCalledWith(expect.any(Request),'notifications.manage');
 expect(response.headers.get('cache-control')).toContain('no-store');
 mocks.auth.mockRejectedValueOnce(new Error('denied'));mocks.rpc.mockClear();
 expect((await GET(new Request('https://example.test'))).status).toBe(503);expect(mocks.rpc).not.toHaveBeenCalled();
});
test('rejects cross-origin, secret-bearing and oversized configuration requests',async()=>{
 expect((await POST(request({name:'Reports'},'https://evil.test'))).status).toBe(403);
 expect((await POST(request({name:'Reports',token:'secret'}))).status).toBe(400);
 expect((await POST(request({name:'x'.repeat(2000)}))).status).toBe(413);
 expect(mocks.rpc).not.toHaveBeenCalled();
});
test('creates metadata through the audited database operation',async()=>{
 mocks.rpc.mockResolvedValue({data:{id:'bot',name:'Reports',credentialState:'missing'},error:null});
 const response=await POST(request({name:' Reports '}));expect(response.status).toBe(201);
 expect(mocks.rpc).toHaveBeenCalledWith('admin_notification_create_bot_v1',{p_operator:'operator',p_request:'request',p_name:'Reports'});
});

test('validates route settings and reports a stale revision',async()=>{
 const value={id:null,revision:0,botId:'11111111-1111-4111-8111-111111111111',kind:'feedback',chatId:'-100123',topicId:null,enabled:false};
 mocks.rpc.mockResolvedValueOnce({data:{...value,id:'route',revision:1},error:null});
 expect((await PUT(request(value))).status).toBe(200);
 mocks.rpc.mockResolvedValueOnce({data:null,error:{code:'40001'}});
 expect((await PUT(request(value))).status).toBe(409);
 mocks.rpc.mockClear();expect((await PUT(request({...value,token:'secret'}))).status).toBe(400);expect(mocks.rpc).not.toHaveBeenCalled();
});
