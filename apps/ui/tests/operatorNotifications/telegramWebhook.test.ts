import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const rpc=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/admin/adminServerClient',()=>({createAdminServiceClient:()=>({rpc})}));
import { POST } from '@/app/api/operator-notifications/telegram/route';
const secret='x'.repeat(40), event='2af02ce8-d02e-4b91-928f-1a74d54dd912', operator='11111111-1111-4111-8111-111111111111';
const body={callback_query:{id:'123',from:{id:123},data:`a_${event}`,message:{chat:{id:-100},message_thread_id:7}}};
const req=(value:unknown,token=secret)=>new Request('https://example.test',{method:'POST',headers:{'x-telegram-bot-api-secret-token':token},body:JSON.stringify(value)});
beforeEach(()=>{vi.stubEnv('OPERATOR_TELEGRAM_WEBHOOK_SECRET',secret);vi.stubEnv('OPERATOR_TELEGRAM_CHAT_ID','-100');vi.stubEnv('OPERATOR_TELEGRAM_ADMISSION_TOPIC_ID','7');vi.stubEnv('OPERATOR_TELEGRAM_ADMIN_MAP',JSON.stringify({'123':operator}));rpc.mockReset().mockResolvedValue({data:'decided',error:null});});
afterEach(()=>{vi.unstubAllEnvs();});
test('checks webhook secret and ignores operators outside the allowlist',async()=>{
 expect((await POST(req(body,'wrong'))).status).toBe(401);
 expect((await POST(req({...body,callback_query:{...body.callback_query,from:{id:999}}}))).status).toBe(200);
 expect(rpc).not.toHaveBeenCalled();
});
test('accepts only callbacks from the configured group and topic',async()=>{
 expect((await POST(req({...body,callback_query:{...body.callback_query,message:{chat:{id:-100},message_thread_id:8}}}))).status).toBe(200);
 expect(rpc).not.toHaveBeenCalled();
 expect((await POST(req(body))).status).toBe(200);
 expect(rpc).toHaveBeenCalledOnce();
 expect(rpc.mock.calls[0][1]).toMatchObject({p_event:event,p_operator:operator,p_action:'approve'});
});

test('accepts only explicitly unthreaded callbacks for an unthreaded destination',async()=>{
 vi.stubEnv('OPERATOR_TELEGRAM_ADMISSION_TOPIC_ID','none');
 expect((await POST(req(body))).status).toBe(200);expect(rpc).not.toHaveBeenCalled();
 const unthreaded={...body,callback_query:{...body.callback_query,message:{chat:{id:-100}}}};
 expect((await POST(req(unthreaded))).status).toBe(200);expect(rpc).toHaveBeenCalledOnce();
});
test('missing topic configuration fails closed',async()=>{
 vi.stubEnv('OPERATOR_TELEGRAM_ADMISSION_TOPIC_ID','');
 await POST(req(body));expect(rpc).not.toHaveBeenCalled();
});
