import 'server-only';
import nodemailer from 'nodemailer';
import { createAdminServiceClient } from '@/lib/admin/adminServerClient';
import { sendBotMessage } from './secretBroker';

type Event={id:string;kind:'admission-request'|'admission-approved'|'feedback';leaseId:string;attempts:number;email:string|null;feedbackId:string|null;admissionStatus:string|null;emailVerified:boolean;eventId:string;botId:string;secretVersion:string;chatId:string;topicId:number|null;transport:"telegram"|"email"};
type Outcome='sent'|'retry'|'failed';

/** Processes one lease; external delivery may succeed even when its receipt is lost. */
export async function dispatchOne(): Promise<'disabled'|'idle'|Outcome> {
 const env=process.env;
 const host=env.OPERATOR_SMTP_HOST,user=env.OPERATOR_SMTP_USER,pass=env.OPERATOR_SMTP_PASSWORD,from=env.OPERATOR_SMTP_FROM,site=env.OPERATOR_NOTIFICATION_SITE_URL;
 const port=Number(env.OPERATOR_SMTP_PORT);
 let siteUrl:URL;
 try {siteUrl=new URL(site || '');} catch {return 'disabled';}
 if (siteUrl.protocol!=='https:' || siteUrl.username || siteUrl.password || siteUrl.search || siteUrl.hash
) return 'disabled';
 const service=createAdminServiceClient();
 const {data,error}=await service.rpc('operator_delivery_claim_v1',{p_limit:1});
 if(error) throw new Error('notification claim failed');
 const event=(data as Event[] | null)?.[0]; if(!event)return 'idle';
 let outcome:Outcome='retry'; let retryAfter=0;
 try {
  if(event.kind==='admission-approved') {
   if(event.admissionStatus!=='approved') outcome='sent';
   else if(!event.email || !event.emailVerified) outcome='failed';
   else if(!host || !user || !pass || !from || !Number.isInteger(port) || port<1 || port>65535) outcome='retry';
   else {
    const smtp=nodemailer.createTransport({host,port,secure:port===465,requireTLS:port!==465,auth:{user,pass},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000});
    await smtp.sendMail({from,to:event.email,subject:'Your 2000NL access is ready',text:`Your request has been approved. You can now sign in at ${siteUrl.origin}/`});
    outcome='sent';
   }
  } else if(event.kind==='admission-request' && event.admissionStatus!=='pending') outcome='sent';
  else {
   const message=event.kind==='admission-request' && event.email
    ? {botId:event.botId,version:event.secretVersion,chatId:event.chatId,topicId:event.topicId,text:`New access request: ${event.email}`,buttons:[[{text:'Approve',callback_data:`a_${event.id}`},{text:'Reject',callback_data:`r_${event.id}`}]]}
    : event.kind==='feedback' && event.feedbackId
      ? {botId:event.botId,version:event.secretVersion,chatId:event.chatId,topicId:event.topicId,text:`New card report: ${event.feedbackId}\n${siteUrl.origin}/admin/reports/?feedback=${encodeURIComponent(event.feedbackId)}`,buttons:null}
      : null;
   if(!message) outcome='failed';
   else {const result=await sendBotMessage(message);outcome=result.status==='sent'?'sent':result.status==='failed'?'failed':'retry';if(result.status==='retry')retryAfter=result.retryAfterSeconds??0;}
  }
 } catch {outcome='retry';}
 if(outcome==='retry' && event.attempts>=10) outcome='failed';
 const delay=Math.min(86400,Math.max(retryAfter,30*2**Math.min(event.attempts-1,10)));
 const settled=await service.rpc('operator_delivery_settle_v1',{p_id:event.id,p_lease:event.leaseId,p_outcome:outcome,p_delay:outcome==='retry'?delay:null});
 if(settled.error || settled.data!==true)throw new Error('notification settlement failed');
 return outcome;
}
