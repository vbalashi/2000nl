import { randomUUID, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin/adminServerClient';

export const runtime='nodejs';
export const dynamic='force-dynamic';

function equalSecret(received: string | null, expected: string | undefined) {
  if (!received || !expected || expected.length < 32 || expected.length > 256) return false;
  const a=Buffer.from(received), b=Buffer.from(expected);
  return a.length===b.length && timingSafeEqual(a,b);
}

export async function POST(request: Request) {
  const respond=(status=200)=>NextResponse.json({ok:status===200},{status,headers:{'Cache-Control':'no-store'}});
  if (!equalSecret(request.headers.get('x-telegram-bot-api-secret-token'),process.env.OPERATOR_TELEGRAM_WEBHOOK_SECRET)) return respond(401);
  const length=Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length>16384) return respond(413);
  let update: unknown;
  try {
    const reader=request.body?.getReader(); if (!reader) return respond(400);
    const chunks: Uint8Array[]=[]; let size=0;
    for (;;) { const part=await reader.read(); if (part.done) break; size+=part.value.length; if (size>16384) {await reader.cancel();return respond(413);} chunks.push(part.value); }
    update=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
  } catch { return respond(400); }
  try {
    const q=(update as {callback_query?: {id?:unknown;from?:{id?:unknown};data?:unknown;message?:{chat?:{id?:unknown};message_thread_id?:unknown}}})?.callback_query;
    const botId=new URL(request.url).searchParams.get('bot');
    if(!botId || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(botId))return respond();
    if (!q || typeof q.data!=='string' || typeof q.from?.id!=='number' || !Number.isSafeInteger(q.from.id)
      || typeof q.message?.chat?.id!=='number' || !Number.isSafeInteger(q.message.chat.id)
      || (q.message.message_thread_id!==undefined && (typeof q.message.message_thread_id!=='number' || !Number.isSafeInteger(q.message.message_thread_id) || q.message.message_thread_id<1))) return respond();
    const match=/^([ar])_([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(q.data);
    if (!match) return respond();
    const mapping: unknown=JSON.parse(process.env.OPERATOR_TELEGRAM_ADMIN_MAP || '{}');
    if (!mapping || typeof mapping!=='object' || Array.isArray(mapping)) return respond();
    const operator=(mapping as Record<string,unknown>)[String(q.from.id)];
    if (typeof operator!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operator)) return respond();
    const {data,error}=await createAdminServiceClient().rpc('operator_delivery_decide_v1',{
      p_delivery:match[2],p_bot:botId,p_chat:String(q.message.chat.id),p_topic:q.message.message_thread_id??null,p_operator:operator,p_action:match[1]==='a'?'approve':'reject',p_request:randomUUID(),
    });
    if (error && error.code!=='42501') return respond(503);
    return respond();
  } catch {return respond(503);}
}
