import 'server-only';
import { request } from 'node:http';

/** Private host socket only; the browser never receives a token or Vault response. */
async function brokerRequest(path:string,payload:unknown,timeoutMs=15000):Promise<unknown> {
 const socketPath=process.env.OPERATOR_SECRET_BROKER_SOCKET;
 if(!socketPath || !socketPath.startsWith('/') || socketPath.includes('\0') || socketPath.length>100)throw new Error('secret storage unavailable');
 const body=JSON.stringify(payload);
 return new Promise((resolve,reject)=>{
  let settled=false;
  let timeout:ReturnType<typeof setTimeout>|undefined;
  const fail=()=>{if(!settled){settled=true;clearTimeout(timeout);reject(new Error('secret storage unavailable'));}};
  const req=request({socketPath,path,method:'PUT',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},res=>{
   const chunks:Buffer[]=[];let size=0;
   res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>2048){res.destroy();fail();}else chunks.push(chunk);});
   res.on('error',fail);res.on('aborted',fail);
   res.on('end',()=>{
    try {
     if(res.statusCode!==200)throw new Error();
     const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
     if(!settled){settled=true;clearTimeout(timeout);resolve(value);}
    }catch{fail();}
   });
  });
  timeout=setTimeout(()=>{req.destroy();fail();},timeoutMs);
  req.on('error',fail);req.end(body);
 });
}

export async function storeBotToken(botId:string,operation:string,token:string):Promise<string> {
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 if(!uuid.test(botId) || !uuid.test(operation) || !/^[0-9]{1,20}:[A-Za-z0-9_-]{1,200}$/.test(token))throw new Error('invalid secret operation');
 const value=await brokerRequest('/v1/bot-token',{botId,operation,token},60000) as {operation?:unknown;version?:unknown}|null;
 if(!value || value.operation!==operation || typeof value.version!=='string' || !/^[0-9a-f]{32}$/.test(value.version))throw new Error('secret storage unavailable');
 return value.version;
}
export type BrokerDelivery={botId:string;version:string;chatId:string;topicId:number|null;text:string;buttons:Array<Array<{text:string;callback_data:string}>>|null};
export async function sendBotMessage(message:BrokerDelivery):Promise<{status:'sent'|'retry'|'failed';retryAfterSeconds?:number}> {
 const value=await brokerRequest('/v1/telegram-delivery',message) as {status?:unknown;retryAfterSeconds?:unknown}|null;
 if(!value || !['sent','retry','failed'].includes(value.status as string))throw new Error('delivery unavailable');
 const status=value.status as 'sent'|'retry'|'failed';
 const delay=value.retryAfterSeconds;
 return {status,...(typeof delay==='number' && Number.isInteger(delay) && delay>0 && delay<=86400?{retryAfterSeconds:delay}:{})};
}

export async function refreshTelegramWebhook(botId: string, version: string): Promise<string> {
 const result = await brokerRequest('/v1/telegram-webhook', {botId, version}, 30000) as {username?: unknown} | null;
 if (typeof result?.username !== 'string' || !/^[A-Za-z0-9_]{5,32}$/.test(result.username)) throw new Error('bot unavailable');
 return result.username;
}

export async function createTelegramTopic(input: {botId: string; version: string; chatId: string; title: string}) {
 const result = await brokerRequest('/v1/telegram-topic', input) as {status?: unknown; topicId?: unknown; title?: unknown} | null;
 if (result?.status === 'rejected') return null;
 if (typeof result?.topicId !== 'number' || !Number.isSafeInteger(result.topicId) || result.topicId <= 1 ||
  typeof result.title !== 'string' || !result.title.trim() || Array.from(result.title).length > 128) throw new Error('topic unavailable');
 return {topicId: result.topicId, title: result.title};
}
