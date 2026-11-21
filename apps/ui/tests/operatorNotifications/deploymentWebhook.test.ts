import {createHmac} from 'node:crypto';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import {POST} from '@/app/api/operator-notifications/deployment/route';

const {rpc} = vi.hoisted(() => ({rpc:vi.fn()}));
vi.mock('@/lib/admin/adminServerClient', () => ({createAdminServiceClient:() => ({rpc})}));

const stageKey = 'a'.repeat(64);
const productionKey = 'b'.repeat(64);
const payload = {result:'failure', runId:'123', runAttempt:'2', candidateRunId:'456'};

function request(stage: string, key: string, values: object = payload) {
  const timestamp = String(Math.floor(Date.now()/1000));
  const body = JSON.stringify(values);
  const signature = createHmac('sha256', key)
    .update(['2000nl-deployment-v1',stage,timestamp,body].join('\n')).digest('hex');
  return new Request('https://example.test/api/operator-notifications/deployment',{
    method:'POST', body, headers:{'x-deployment-stage':stage,'x-deployment-timestamp':timestamp,'x-deployment-signature':signature},
  });
}

beforeEach(() => {
  vi.stubEnv('OPERATOR_DEPLOYMENT_STAGING_KEY', stageKey);
  vi.stubEnv('OPERATOR_DEPLOYMENT_PRODUCTION_KEY', productionKey);
  vi.stubEnv('OPERATOR_DEPLOYMENT_REPOSITORY','example/project');
  rpc.mockReset().mockResolvedValue({data:'queued',error:null});
});
afterEach(() => {vi.unstubAllEnvs();});

test('accepts an authenticated GitHub outcome and derives all message links on the server', async () => {
  const response = await POST(request('production', productionKey));
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({status:'queued'});
  expect(rpc).toHaveBeenCalledWith('operator_enqueue_deployment_v1',{
    p_stage:'production',p_run:'123:2',p_values:{
      status:'❌ Ошибка', version:'—', commit:'—',
      run_url:'https://github.com/example/project/actions/runs/123/attempts/2',
      candidate_url:'https://github.com/example/project/actions/runs/456',
    },
  });
});

test('rejects a key for the wrong stage and malformed signed metadata', async () => {
  expect((await POST(request('production', stageKey))).status).toBe(401);
  expect((await POST(request('production', productionKey, {...payload,runId:'https://example.test'}))).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
