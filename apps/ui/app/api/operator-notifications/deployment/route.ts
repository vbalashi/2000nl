import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin/adminServerClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const statuses = {success:'✅ Успешно', failure:'❌ Ошибка', cancelled:'⚠️ Отменён'};
const numeric = /^[1-9][0-9]{0,18}$/;
const maxBody = 2048;
const reply = (status: number, body: object = {}) => NextResponse.json(body, {
  status, headers: {'Cache-Control':'no-store'},
});

export async function POST(request: Request) {
  const stage = request.headers.get('x-deployment-stage');
  const secret = stage === 'staging' ? process.env.OPERATOR_DEPLOYMENT_STAGING_KEY
    : stage === 'production' ? process.env.OPERATOR_DEPLOYMENT_PRODUCTION_KEY : undefined;
  const timestamp = request.headers.get('x-deployment-timestamp');
  const signature = request.headers.get('x-deployment-signature');
  if (!secret || !/^[a-f0-9]{64}$/.test(secret) || !timestamp || !/^\d{10}$/.test(timestamp) ||
    Math.abs(Date.now()/1000-Number(timestamp)) > 300 || !signature || !/^[a-f0-9]{64}$/.test(signature)) return reply(401);

  let body: Buffer;
  try {
    const reader = request.body?.getReader();
    if (!reader) return reply(400);
    const parts: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > maxBody) {await reader.cancel(); return reply(413);}
      parts.push(part.value);
    }
    body = Buffer.concat(parts);
  } catch {return reply(400);}

  const expected = createHmac('sha256', secret).update(`2000nl-deployment-v1\n${stage}\n${timestamp}\n`).update(body).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return reply(401);

  let value: Record<string, unknown>;
  try {value = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(body));}
  catch {return reply(400);}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return reply(400);
  const {result, runId, runAttempt, version, commit, candidateRunId} = value;
  if (typeof result !== 'string' || !Object.hasOwn(statuses, result) ||
    typeof runId !== 'string' || !numeric.test(runId) ||
    typeof runAttempt !== 'string' || !/^[1-9][0-9]{0,8}$/.test(runAttempt) ||
    (version !== undefined && (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(version) || version.length > 80)) ||
    (commit !== undefined && (typeof commit !== 'string' || !/^[a-f0-9]{40}$/.test(commit))) ||
    (candidateRunId !== undefined && (stage !== 'production' || typeof candidateRunId !== 'string' || !numeric.test(candidateRunId)))) return reply(400);
  const repository = process.env.OPERATOR_DEPLOYMENT_REPOSITORY;
  if (!repository || !/^[\w.-]{1,39}\/[\w.-]{1,100}$/.test(repository)) return reply(503);
  const runs = `https://github.com/${repository}/actions/runs`;
  try {
    const {data, error} = await createAdminServiceClient().rpc('operator_enqueue_deployment_v1', {
      p_stage:stage, p_run:`${runId}:${runAttempt}`, p_values:{
        status:statuses[result as keyof typeof statuses], version:version ?? '—', commit:commit ?? '—',
        run_url:`${runs}/${runId}/attempts/${runAttempt}`, candidate_url:candidateRunId ? `${runs}/${candidateRunId}` : '—',
      },
    });
    if (error || !['queued','disabled','no-route'].includes(data)) return reply(503);
    return reply(202, {status:data});
  } catch {return reply(503);}
}
