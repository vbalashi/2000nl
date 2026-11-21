import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminServiceClient } from '@/lib/admin/adminServerClient';

import { recordDiscovery } from '@/lib/operatorNotifications/discovery';

export const runtime='nodejs';
export const dynamic='force-dynamic';

function equalSecret(received: string | null, expected: string | undefined) {
  if (!received || !expected || expected.length < 32 || expected.length > 256) return false;
  const a=Buffer.from(received), b=Buffer.from(expected);
  return a.length===b.length && timingSafeEqual(a,b);
}

export async function POST(request: Request) {
  const respond=(status=200)=>NextResponse.json({ok:status===200},{status,headers:{'Cache-Control':'no-store'}});
  const botId=new URL(request.url).searchParams.get('bot');
  const secretVersion=new URL(request.url).searchParams.get('version');
  const rootSecret=process.env.OPERATOR_TELEGRAM_WEBHOOK_SECRET;
  if(!botId || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(botId) || !secretVersion || !/^[0-9a-f]{32}$/.test(secretVersion) || !rootSecret || rootSecret.length<32 || rootSecret.length>256)return respond(401);
  const credential=createHmac('sha256',rootSecret).update('2000nl-telegram-webhook-v1\0'+botId+'\0'+secretVersion).digest('hex');
  if (!equalSecret(request.headers.get('x-telegram-bot-api-secret-token'),credential)) return respond(401);
  // A subscribed group can produce oversized messages unrelated to notification setup.
  // Acknowledge a signed update we can't process so Telegram does not retry it.
  const maxUpdateBytes=65536;
  const length=Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length>maxUpdateBytes) return respond();
  let update: unknown;
  try {
    const reader=request.body?.getReader(); if (!reader) return respond(400);
    const chunks: Uint8Array[]=[]; let size=0;
    for (;;) { const part=await reader.read(); if (part.done) break; size+=part.value.length; if (size>maxUpdateBytes) {await reader.cancel();return respond();} chunks.push(part.value); }
    update=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
  } catch { return respond(400); }
  try {
    const q=(update as {callback_query?: {id?:unknown;from?:{id?:unknown};data?:unknown;message?:{chat?:{id?:unknown};message_thread_id?:unknown}}})?.callback_query;
    if (!q) {
      const confirmation = await recordDiscovery(update, botId, secretVersion);
      return confirmation ? NextResponse.json(confirmation, {headers:{'Cache-Control':'no-store'}}) : respond();
    }
    if (typeof q.id!=='string' || q.id.length<1 || q.id.length>256 || typeof q.data!=='string' || typeof q.from?.id!=='number' || !Number.isSafeInteger(q.from.id)
      || typeof q.message?.chat?.id!=='number' || !Number.isSafeInteger(q.message.chat.id)
      || (q.message.message_thread_id!==undefined && (typeof q.message.message_thread_id!=='number' || !Number.isSafeInteger(q.message.message_thread_id) || q.message.message_thread_id<1))) return respond();
    const match=/^([ar])_([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(q.data);
    if (!match) return respond();
    const mapping: unknown=JSON.parse(process.env.OPERATOR_TELEGRAM_ADMIN_MAP || '{}');
    if (!mapping || typeof mapping!=='object' || Array.isArray(mapping)) return respond();
    const operator=(mapping as Record<string,unknown>)[String(q.from.id)];
    const answer=(text:string)=>NextResponse.json({method:'answerCallbackQuery',callback_query_id:q.id,text},{headers:{'Cache-Control':'no-store'}});
    if (typeof operator!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operator)) return answer('Нет права обрабатывать эту заявку.');
    const {data,error}=await createAdminServiceClient().rpc('operator_delivery_decide_v1',{
      p_delivery:match[2],p_bot:botId,p_version:secretVersion,p_chat:String(q.message.chat.id),p_topic:q.message.message_thread_id??null,p_operator:operator,p_action:match[1]==='a'?'approve':'reject',p_request:randomUUID(),
    });
    if (error && error.code!=='42501') return respond(503);
    // Telegram executes this method as the webhook response; no bot token is read by the app.
    return answer(error?'Нет права обрабатывать эту заявку.':data==='decided'?'Решение сохранено.':data==='already_decided'?'Заявка уже обработана.':'Кнопка больше не действует.');
  } catch {return respond(503);}
}
