import 'server-only';
import nodemailer from 'nodemailer';
import { createAdminServiceClient } from '@/lib/admin/adminServerClient';
import { sendTelegramMessage } from './telegram';
import { parseTopic } from './topic';

type Event={id:string;kind:'admission-request'|'admission-approved'|'feedback';leaseId:string;attempts:number;email:string|null;feedbackId:string|null;admissionStatus:string|null};
type Outcome='sent'|'retry'|'failed';

/** Processes one lease; external delivery may succeed even when its receipt is lost. */
export async function dispatchOne(): Promise<'disabled'|'idle'|Outcome> {
 const env=process.env;
 const token=env.OPERATOR_TELEGRAM_BOT_TOKEN,chat=env.OPERATOR_TELEGRAM_CHAT_ID;
 const admissions=parseTopic(env.OPERATOR_TELEGRAM_ADMISSION_TOPIC_ID),reports=parseTopic(env.OPERATOR_TELEGRAM_FEEDBACK_TOPIC_ID);
 const host=env.OPERATOR_SMTP_HOST,user=env.OPERATOR_SMTP_USER,pass=env.OPERATOR_SMTP_PASSWORD,from=env.OPERATOR_SMTP_FROM,site=env.OPERATOR_NOTIFICATION_SITE_URL;
 const port=Number(env.OPERATOR_SMTP_PORT);
 let siteUrl:URL;
 try {siteUrl=new URL(site || '');} catch {return 'disabled';}
 if (siteUrl.protocol!=='https:' || siteUrl.username || siteUrl.password || siteUrl.search || siteUrl.hash
   || !token || !/^\d+:[A-Za-z0-9_-]+$/.test(token) || !chat || !/^-?\d+$/.test(chat)
   || admissions===undefined || reports===undefined
   || !host || !user || !pass || !from || !Number.isInteger(port) || port<1 || port>65535) return 'disabled';
 const service=createAdminServiceClient();
 const {data,error}=await service.rpc('operator_notification_claim_v1',{p_limit:1});
 if(error) throw new Error('notification claim failed');
 const event=(data as Event[] | null)?.[0]; if(!event)return 'idle';
 let outcome:Outcome='retry'; let retryAfter=0;
 try {
  if(event.kind==='admission-approved') {
   if(event.admissionStatus!=='approved') outcome='sent';
   else if(!event.email) outcome='failed';
   else {
    const smtp=nodemailer.createTransport({host,port,secure:port===465,requireTLS:port!==465,auth:{user,pass},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000});
    await smtp.sendMail({from,to:event.email,subject:'Your 2000NL access is ready',text:`Your request has been approved. You can now sign in at ${siteUrl.origin}/`});
    outcome='sent';
   }
  } else if(event.kind==='admission-request' && event.admissionStatus!=='pending') outcome='sent';
  else {
   const message=event.kind==='admission-request' && event.email
    ? {chatId:chat,topicId:admissions,text:`New access request: ${event.email}`,buttons:[[{text:'Approve',callbackData:`a_${event.id}`},{text:'Reject',callbackData:`r_${event.id}`}]]}
    : event.kind==='feedback' && event.feedbackId
      ? {chatId:chat,topicId:reports,text:`New card report: ${event.feedbackId}\n${siteUrl.origin}/admin/reports/?feedback=${encodeURIComponent(event.feedbackId)}`}
      : null;
   if(!message) outcome='failed';
   else {const result=await sendTelegramMessage(token,message);outcome=result.status==='sent'?'sent':result.status==='failed'?'failed':'retry';if(result.status==='retry')retryAfter=result.retryAfterSeconds??0;}
  }
 } catch {outcome='retry';}
 if(outcome==='retry' && event.attempts>=10) outcome='failed';
 const delay=Math.min(86400,Math.max(retryAfter,30*2**Math.min(event.attempts-1,10)));
 const settled=await service.rpc('operator_notification_settle_v1',{p_id:event.id,p_lease:event.leaseId,p_outcome:outcome,p_delay:outcome==='retry'?delay:null});
 if(settled.error || settled.data!==true)throw new Error('notification settlement failed');
 return outcome;
}
