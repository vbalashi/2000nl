import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/admin/adminServerClient', () => ({ createAdminServiceClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('@/lib/operatorNotifications/telegram', () => ({ sendTelegramMessage: vi.fn() }));
import { dispatchOne } from '@/lib/operatorNotifications/dispatch';

// A disposable loopback-only Mailpit listener with STARTTLS; never point at a real provider.
const smtpPort = Number(process.env.OPERATOR_TEST_SMTP_PORT);
const httpPort = Number(process.env.OPERATOR_TEST_MAILPIT_HTTP_PORT);
const enabled = Number.isInteger(smtpPort) && smtpPort > 0 && Number.isInteger(httpPort) && httpPort > 0;
describe.skipIf(!enabled)('isolated SMTP delivery', () => {
 beforeEach(() => {
  for (const [key, value] of Object.entries({
   OPERATOR_TELEGRAM_BOT_TOKEN:'1:fake', OPERATOR_TELEGRAM_CHAT_ID:'-100',
   OPERATOR_TELEGRAM_ADMISSION_TOPIC_ID:'7', OPERATOR_TELEGRAM_FEEDBACK_TOPIC_ID:'8',
   OPERATOR_SMTP_HOST:'127.0.0.1', OPERATOR_SMTP_PORT:String(smtpPort),
   OPERATOR_SMTP_USER:'synthetic', OPERATOR_SMTP_PASSWORD:'synthetic',
   OPERATOR_SMTP_FROM:'sender@example.test', OPERATOR_NOTIFICATION_SITE_URL:'https://example.test',
  })) vi.stubEnv(key, value);
  mocks.rpc.mockReset();
 });
 afterEach(() => vi.unstubAllEnvs());
 test('sends the approval through STARTTLS to an isolated receiver', async () => {
  const event={id:'11111111-1111-4111-8111-111111111111',kind:'admission-approved',leaseId:'lease',attempts:1,email:'recipient@example.test',feedbackId:null,admissionStatus:'approved'};
  mocks.rpc.mockImplementation(async (name: string) => name==='operator_notification_claim_v1' ? {data:[event],error:null} : {data:true,error:null});
  expect(await dispatchOne()).toBe('sent');
  const response=await fetch(`http://127.0.0.1:${httpPort}/api/v1/messages`);
  expect(response.ok).toBe(true);
  const mailbox=await response.json() as {messages: Array<{Subject:string;To:Array<{Address:string}>}>};
  expect(mailbox.messages).toEqual(expect.arrayContaining([expect.objectContaining({Subject:'Your 2000NL access is ready',To:expect.arrayContaining([expect.objectContaining({Address:'recipient@example.test'})])})]));
  expect(mocks.rpc.mock.calls[1][1]).toMatchObject({p_outcome:'sent',p_lease:'lease'});
 });
});
