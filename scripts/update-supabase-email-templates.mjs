import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const kinds=['confirmation','magic_link','recovery'];
const subjects={confirmation:'Welcome to 2000nl',magic_link:'Your sign-in code for 2000nl',recovery:'Reset your 2000nl password'};
const templates=Object.fromEntries(await Promise.all(kinds.map(async kind=>[kind,await readFile(path.join(root,'supabase/templates',kind+'.html'),'utf8')])));
const args=process.argv.slice(2);
if(args[0]==='--preview'&&args.length===2){
 await mkdir(args[1],{recursive:true});
 for(const kind of kinds)await writeFile(path.join(args[1],kind+'.html'),templates[kind].replaceAll('{{ .Token }}','12345678').replaceAll('{{ .ConfirmationURL }}','https://2000.dilum.io/'));
 console.log(`Rendered ${kinds.length} previews; no Auth configuration changed.`);
}else if(args[0]==='--apply'&&args.length===1){
 const token=process.env.SUPABASE_ACCESS_TOKEN,project=process.env.SUPABASE_PROJECT_REF;
 if(!token||!project)throw new Error('Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF in the server-side environment.');
 if(!/^[a-z0-9]{20}$/.test(project))throw new Error('Invalid Supabase project reference.');
 const url=`https://api.supabase.com/v1/projects/${project}/config/auth`;
 const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
 const read=await fetch(url,{headers});if(!read.ok)throw new Error(`Auth configuration read failed (${read.status}).`);
 const current=await read.json(),patch={};
 for(const kind of kinds){patch[`mailer_subjects_${kind}`]=subjects[kind];patch[`mailer_templates_${kind}_content`]=templates[kind]}
 // Keep a local recoverable snapshot of only the fields we replace, never SMTP/OAuth secrets.
 const previous=Object.fromEntries(Object.keys(patch).map(key=>[key,current[key]]));
 const backup=path.join(root,'tmp',`auth-email-backup-${Date.now()}.json`);await mkdir(path.dirname(backup),{recursive:true});await writeFile(backup,JSON.stringify(previous,null,2),{mode:0o600});
 const result=await fetch(url,{method:'PATCH',headers,body:JSON.stringify(patch)});if(!result.ok)throw new Error(`Template update failed (${result.status}); no success claimed.`);
 const verify=await fetch(url,{headers});if(!verify.ok)throw new Error(`Template verification failed (${verify.status}).`);
 const applied=await verify.json();if(Object.entries(patch).some(([key,value])=>applied[key]!==value))throw new Error('Template verification mismatch.');
 console.log(`Verified ${kinds.length} English templates. Recovery snapshot: ${backup}`);
}else{console.log('Usage: node scripts/update-supabase-email-templates.mjs --preview <directory> | --apply');process.exitCode=args.length?1:0}
