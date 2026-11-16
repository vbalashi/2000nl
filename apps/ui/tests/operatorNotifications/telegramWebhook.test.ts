import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/admin/adminServerClient',()=>({createAdminServiceClient:()=>({rpc})}));
import { POST } from '@/app/api/operator-notifications/telegram/route';
const secret='x'.repeat(40), event='2af02ce8-d02e-4b91-928f-1a74d54dd912', operator='11111111-1111-4111-8111-111111111111';
const body={callback_query:{id:'123',from:{id:123},data:`a_${event}`,message:{chat:{id:-100},message_thread_id:7}}};
const bot='33333333-3333-4333-8333-333333333333';
const credential=createHmac('sha256',secret).update('2000nl-telegram-webhook-v1\0'+bot+'\0'+'a'.repeat(32)).digest('hex');
const req=(value:unknown,token=credential)=>new Request('https://example.test/api/operator-notifications/telegram?bot='+bot+'&version='+'a'.repeat(32),{method:'POST',headers:{'x-telegram-bot-api-secret-token':token},body:JSON.stringify(value)});
beforeEach(()=>{vi.stubEnv('OPERATOR_TELEGRAM_WEBHOOK_SECRET',secret);vi.stubEnv('OPERATOR_TELEGRAM_ADMIN_MAP',JSON.stringify({'123':operator}));rpc.mockReset().mockResolvedValue({data:'decided',error:null});});
afterEach(()=>{vi.unstubAllEnvs();});
test('checks webhook secret and ignores operators outside the allowlist',async()=>{
 expect((await POST(req(body,'wrong'))).status).toBe(401);
 expect((await POST(req({...body,callback_query:{...body.callback_query,from:{id:999}}}))).status).toBe(200);
 expect(rpc).not.toHaveBeenCalled();
});
test('passes the exact delivery scope to the database authorization',async()=>{
 expect((await POST(req(body))).status).toBe(200);
 expect(rpc).toHaveBeenCalledOnce();
 expect(rpc).toHaveBeenCalledWith('operator_delivery_decide_v1',expect.objectContaining({p_delivery:event,p_bot:bot,p_version:'a'.repeat(32),p_chat:'-100',p_topic:7,p_operator:operator,p_action:'approve'}));
});
test('supports an unthreaded delivery without widening its scope',async()=>{
 const unthreaded={...body,callback_query:{...body.callback_query,message:{chat:{id:-100}}}};
 expect((await POST(req(unthreaded))).status).toBe(200);
 expect(rpc.mock.calls[0][1]).toMatchObject({p_topic:null,p_chat:'-100'});
});
test('rejects a missing bot identity before database access',async()=>{
 await POST(new Request('https://example.test',{method:'POST',headers:{'x-telegram-bot-api-secret-token':secret},body:JSON.stringify(body)}));
 expect(rpc).not.toHaveBeenCalled();
});

test('answers the button through the webhook without fetching a bot token',async()=>{
 const response=await POST(req(body));
 expect(await response.json()).toEqual({method:'answerCallbackQuery',callback_query_id:'123',text:'Решение сохранено.'});
 rpc.mockResolvedValueOnce({data:'already_decided',error:null});
 expect(await (await POST(req(body))).json()).toMatchObject({text:'Заявка уже обработана.'});
 rpc.mockResolvedValueOnce({data:null,error:{code:'42501'}});
 expect(await (await POST(req(body))).json()).toMatchObject({text:'Нет права обрабатывать эту заявку.'});
});

test('a webhook credential cannot cross bot or key-version boundaries',async()=>{
 for(const [candidateBot,version] of [[bot,'b'.repeat(32)],['22222222-2222-4222-8222-222222222222','a'.repeat(32)]]){
  const request=new Request('https://example.test/api/operator-notifications/telegram?bot='+candidateBot+'&version='+version,{method:'POST',headers:{'x-telegram-bot-api-secret-token':credential},body:JSON.stringify(body)});
  expect((await POST(request)).status).toBe(401);
 }
 expect(rpc).not.toHaveBeenCalled();
});
