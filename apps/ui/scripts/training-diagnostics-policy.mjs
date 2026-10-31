#!/usr/bin/env node
// Run against the operator-owned mounted policy directory, never a public path.
import {readFileSync,writeFileSync,renameSync} from 'node:fs';
const [file,action,...args]=process.argv.slice(2);
if(!file||!['off','baseline','detail','status'].includes(action))throw new Error('Usage: node training-diagnostics-policy.mjs FILE off|baseline|status|detail USER_UUID|all MINUTES');
let policy={enabled:false,successSampleRate:0.01,users:{}};
try{policy=JSON.parse(readFileSync(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
if(action==='status'){console.log(JSON.stringify(policy,null,2));process.exit(0);}
if(action==='off')policy.enabled=false;
if(action==='baseline'){policy={enabled:true,successSampleRate:0.01,users:{}};}
if(action==='detail'){
 const [user,minutesText]=args,minutes=Number(minutesText);
 if(!user||(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(user)&&user!=='all')||!Number.isFinite(minutes)||minutes<=0||minutes>1440)throw new Error('Detail requires USER_UUID (or explicit all) and minutes in (0, 1440].');
 policy.enabled=true;policy.successSampleRate??=0.01;policy.users??={};
 const until=new Date(Date.now()+minutes*60_000).toISOString();
 if(user==='all')policy.detailedUntil=until;else policy.users[user]=until;
}
const tmp=`${file}.${process.pid}.tmp`;
writeFileSync(tmp,JSON.stringify(policy,null,2)+'\n',{mode:0o600,flag:'wx'});
renameSync(tmp,file);
console.log(`Updated diagnostics policy: ${action}`);
