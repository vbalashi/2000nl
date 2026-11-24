import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),auth:vi.fn(),store:vi.fn(),send:vi.fn()}));
vi.mock('@/lib/admin/adminAccess',()=>({requireAdmin:mocks.auth,adminErrorResponse:()=>new Response(JSON.stringify({error:'unavailable'}),{status:503})}));
vi.mock('@/lib/admin/adminServerClient',()=>({createAdminServiceClient:()=>({rpc:mocks.rpc})}));
vi.mock('@/lib/operatorNotifications/secretBroker',()=>({storeBotToken:mocks.store,sendBotMessage:mocks.send}));
import {GET,POST,PUT,PATCH} from '@/app/api/admin/notifications/route';
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

test('saves a token through an audited pending operation without returning it',async()=>{
 const value={botId:'11111111-1111-4111-8111-111111111111',revision:1,token:'123:fake_token'};
 mocks.rpc.mockResolvedValueOnce({data:{operation:'request'},error:null}).mockResolvedValueOnce({data:true,error:null});
 mocks.store.mockResolvedValueOnce('a'.repeat(32));
 const result=await PATCH(request(value));expect(result.status).toBe(200);expect(await result.json()).toEqual({saved:true});
 expect(mocks.rpc.mock.calls[1][1]).toMatchObject({p_version:'a'.repeat(32),p_operation:'request'});
});
test('failed Vault storage marks the operation failed without leaking the token',async()=>{
 mocks.rpc.mockResolvedValueOnce({data:{operation:'request'},error:null}).mockResolvedValueOnce({data:true,error:null});
 mocks.store.mockRejectedValueOnce(new Error('secret 123:fake_token'));
 const result=await PATCH(request({botId:'11111111-1111-4111-8111-111111111111',revision:1,token:'123:fake_token'}));
 expect(result.status).toBe(503);expect(JSON.stringify(await result.json())).not.toContain('fake_token');
 expect(mocks.rpc.mock.calls[1][1]).toMatchObject({p_version:null});
});

test('changes the global switch through the audited operation and rejects extra fields',async()=>{
 mocks.rpc.mockResolvedValue({data:true,error:null});
 const result=await POST(request({enabled:true}));
 expect(result.status).toBe(200);expect(await result.json()).toEqual({enabled:true});
 expect(mocks.rpc).toHaveBeenCalledWith('admin_notification_enabled_v1',{p_operator:'operator',p_request:'request',p_enabled:true});
 mocks.rpc.mockClear();expect((await POST(request({enabled:true,token:'secret'}))).status).toBe(400);expect(mocks.rpc).not.toHaveBeenCalled();
});

test('tests a draft with synthetic values without publishing it or providing action buttons',async()=>{
 const input={action:'test-template',kind:'admission-request',body:'Draft: {{email}}',
  botId:'11111111-1111-4111-8111-111111111111',chatId:'-100999',topicId:7};
 mocks.send.mockReset().mockResolvedValue({status:'sent'});
 mocks.rpc.mockResolvedValueOnce({data:'a'.repeat(32),error:null});
 expect((await POST(request(input))).status).toBe(200);
 expect(mocks.rpc.mock.calls.map(call=>call[0])).toEqual(['admin_notification_authorize_test_v1']);
 expect(mocks.send).toHaveBeenCalledWith({botId:input.botId,version:'a'.repeat(32),chatId:'-100999',
  topicId:7,text:'[ТЕСТ]\nDraft: learner@example.org',buttons:null});
 mocks.send.mockClear();
 mocks.rpc.mockResolvedValueOnce({data:null,error:{code:'22023',message:'chat_is_routed'}});
 expect((await POST(request(input))).status).toBe(422);
 expect(mocks.send).not.toHaveBeenCalled();
});

test('validates the rendered draft before publishing and preserves conflict handling',async()=>{
 const input={action:'publish-template',kind:'feedback',body:'Report {{report_id}}',revision:'0'};
 expect((await POST(request({...input,body:'Report {{email}}'}))).status).toBe(400);
 expect(mocks.rpc).not.toHaveBeenCalled();
 mocks.rpc.mockResolvedValueOnce({data:null,error:{code:'40001'}});
 expect((await POST(request(input))).status).toBe(409);
});

test('sends the preview to the saved route, including its Telegram topic', async () => {
 const routeId = '22222222-2222-4222-8222-222222222222';
 const target = {botId:'11111111-1111-4111-8111-111111111111',chatId:'-100987',topicId:7,version:'a'.repeat(32)};
 const input = {action:'test-route-template',kind:'deployment-production',body:'Production: {{status}}',routeId,routeRevision:3};
 mocks.send.mockReset().mockResolvedValue({status:'sent'});
 const preview = await POST(request({action:'preview-template',kind:input.kind,body:input.body}));
 mocks.rpc.mockResolvedValueOnce({data:target,error:null});
 expect((await POST(request(input))).status).toBe(200);
 expect(mocks.rpc).toHaveBeenCalledTimes(1);
 expect(mocks.rpc).toHaveBeenCalledWith('admin_notification_authorize_route_test_v1',
  {p_operator:'operator',p_request:'request',p_route:routeId,p_revision:3,p_kind:'deployment'});
 expect(mocks.send).toHaveBeenCalledTimes(1);
 expect(mocks.send).toHaveBeenCalledWith({...target,text:'[ТЕСТ]\n'+(await preview.json()).text,buttons:null});
 mocks.send.mockClear();
 mocks.rpc.mockClear();
 expect((await POST(request({...input,chatId:'-100999'}))).status).toBe(400);
 expect(mocks.rpc).not.toHaveBeenCalled();
 mocks.rpc.mockResolvedValueOnce({data:null,error:{code:'40001'}});
 expect((await POST(request(input))).status).toBe(409);
 expect(mocks.send).not.toHaveBeenCalled();
});
