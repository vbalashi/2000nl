import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),send:vi.fn(),mail:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/admin/adminServerClient',()=>({createAdminServiceClient:()=>({rpc:mocks.rpc})}));
vi.mock('@/lib/operatorNotifications/secretBroker',()=>({sendBotMessage:mocks.send}));
vi.mock('nodemailer',()=>({default:{createTransport:()=>({sendMail:mocks.mail})}}));
import { dispatchOne } from '@/lib/operatorNotifications/dispatch';
const event={id:'2af02ce8-d02e-4b91-928f-1a74d54dd912',kind:'admission-request',leaseId:'lease',attempts:1,email:'a@example.test',feedbackId:null,admissionStatus:'pending',emailVerified:true,eventId:'2af02ce8-d02e-4b91-928f-1a74d54dd912',botId:'11111111-1111-4111-8111-111111111111',secretVersion:'a'.repeat(32),chatId:'-100',topicId:7,transport:'telegram'};
const config={OPERATOR_TELEGRAM_BOT_TOKEN:'1:fake',OPERATOR_TELEGRAM_CHAT_ID:'-100',OPERATOR_TELEGRAM_ADMISSION_TOPIC_ID:'7',OPERATOR_TELEGRAM_FEEDBACK_TOPIC_ID:'8',OPERATOR_SMTP_HOST:'smtp.test',OPERATOR_SMTP_USER:'u',OPERATOR_SMTP_PASSWORD:'p',OPERATOR_SMTP_FROM:'app@example.test',OPERATOR_NOTIFICATION_SITE_URL:'https://example.test',OPERATOR_SMTP_PORT:'587'};
beforeEach(()=>{for(const [k,v] of Object.entries(config))vi.stubEnv(k,v);mocks.rpc.mockReset();mocks.send.mockReset();mocks.mail.mockReset();});
afterEach(()=>{vi.unstubAllEnvs();});
function claim(value:unknown){mocks.rpc.mockImplementation(async(name:string)=>name==='operator_delivery_claim_v1'?{data:value,error:null}:{data:true,error:null});}
test('does not claim when not configured',async()=>{vi.stubEnv('OPERATOR_NOTIFICATION_SITE_URL','');expect(await dispatchOne()).toBe('disabled');expect(mocks.rpc).not.toHaveBeenCalled();});
test('routes a pending request with opaque actions and settles it',async()=>{claim([event]);mocks.send.mockResolvedValue({status:'sent',messageId:1});expect(await dispatchOne()).toBe('sent');expect(mocks.send.mock.calls[0][0]).toMatchObject({topicId:7,text:'New access request: a@example.test',buttons:[[{callback_data:`a_${event.id}`},{callback_data:`r_${event.id}`}]]});expect(mocks.rpc.mock.calls[1][1]).toMatchObject({p_outcome:'sent',p_lease:'lease'});});
test('sends approval mail only for current approval',async()=>{claim([{...event,kind:'admission-approved',admissionStatus:'approved'}]);expect(await dispatchOne()).toBe('sent');expect(mocks.mail).toHaveBeenCalledOnce();expect(mocks.mail.mock.calls[0][0]).toMatchObject({to:'a@example.test'});});
test('retries transient failures and exhausts after ten attempts',async()=>{claim([{...event,attempts:10}]);mocks.send.mockResolvedValue({status:'retry'});expect(await dispatchOne()).toBe('failed');expect(mocks.rpc.mock.calls[1][1]).toMatchObject({p_outcome:'failed'});});
test('links feedback to its administrative detail by feedback item ID',async()=>{const id='11111111-1111-4111-8111-111111111111';claim([{...event,kind:'feedback',email:null,feedbackId:id}]);mocks.send.mockResolvedValue({status:'sent',messageId:1});expect(await dispatchOne()).toBe('sent');expect(mocks.send.mock.calls[0][0]).toMatchObject({topicId:7,text:`New card report: ${id}\nhttps://example.test/admin/reports/?feedback=${id}`});});


test('does not mail when the approved identity is no longer verified',async()=>{claim([{...event,kind:'admission-approved',admissionStatus:'approved',emailVerified:false}]);expect(await dispatchOne()).toBe('failed');expect(mocks.mail).not.toHaveBeenCalled();});

test('renders the pinned release template for its Telegram topic without decision buttons', async () => {
 claim([{...event,kind:'deployment',deploymentStage:'production',email:null,templateBody:'Prod {{status}}\n{{version}}',
  deploymentValues:{status:'❌ Ошибка',version:'1.2.3'}}]);
 mocks.send.mockResolvedValue({status:'sent'});
 expect(await dispatchOne()).toBe('sent');
 expect(mocks.send).toHaveBeenCalledWith({
  botId:event.botId,version:event.secretVersion,chatId:'-100',topicId:7,text:'Prod ❌ Ошибка\n1.2.3',buttons:null,
 });
});
