#!/usr/bin/env node
// Disposable local-only real Auth + Data API regression harness. No .env files.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const prefix=`2000nl-connect-test-${process.pid}`,network=prefix,db=`${prefix}-db`,auth=`${prefix}-auth`,rest=`${prefix}-rest`;
const database='2000nl_fsrs_connect_security',password='local-fixture-only',secret='audit68-local-only-jwt-secret-never-for-deployment';
let gateway;
const run=(args,input)=>{const r=spawnSync('docker',args,{encoding:'utf8',input,maxBuffer:20*1024*1024});if(r.status!==0)throw new Error(r.stderr||r.stdout||'docker failed');return r.stdout.trim();};
const port=(name,internal)=>Number(run(['port',name,`${internal}/tcp`]).split(':').at(-1));
async function ready(url){for(let n=0;n<100;n++){try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,200));}throw new Error(`Local service not ready: ${url}`);}
try {
 run(['network','create',network]);
 run(['run','-d','--name',db,'--network',network,'-p','127.0.0.1::5432','-e',`POSTGRES_PASSWORD=${password}`,'-e',`POSTGRES_DB=${database}`,'postgres:17','-c','jit=off']);
 for(let n=0;n<100;n++){const r=spawnSync('docker',['exec',db,'pg_isready','-h','127.0.0.1','-U','postgres']);if(r.status===0)break;await new Promise(r=>setTimeout(r,200));}
 run(['exec',db,'psql','-U','postgres','-d',database,'-c',`CREATE SCHEMA auth; ALTER ROLE postgres IN DATABASE "${database}" SET search_path=auth,public;`]);
 const uri=`postgres://postgres:${password}@${db}:5432/${database}`;
 run(['run','-d','--name',auth,'--network',network,'-p','127.0.0.1::9999',...Object.entries({GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:'9999',API_EXTERNAL_URL:'http://127.0.0.1:9999',GOTRUE_SITE_URL:'http://127.0.0.1:3100',GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:uri,GOTRUE_JWT_SECRET:secret,GOTRUE_JWT_EXP:'3600',GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_JWT_ADMIN_ROLES:'service_role',GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',GOTRUE_MAILER_AUTOCONFIRM:'true'}).flatMap(([k,v])=>['-e',`${k}=${v}`]),'public.ecr.aws/supabase/gotrue:v2.197.0']);
 const authPort=port(auth,9999);await ready(`http://127.0.0.1:${authPort}/health`);
 run(['exec','-i',db,'psql','-v','ON_ERROR_STOP=1','-U','postgres','-d',database],readFileSync(path.join(root,'db/scripts/plain_postgres_supabase_compat.sql'),'utf8'));
 run(['exec',db,'psql','-U','postgres','-d',database,'-c','ALTER ROLE service_role BYPASSRLS']);
 run(['run','-d','--name',rest,'--network',network,'-p','127.0.0.1::3000','-e',`PGRST_DB_URI=${uri}`,'-e','PGRST_DB_SCHEMAS=public','-e','PGRST_DB_ANON_ROLE=anon','-e','PGRST_DB_PRE_REQUEST=public.admission_enforce','-e',`PGRST_JWT_SECRET=${secret}`,'public.ecr.aws/supabase/postgrest:v14.10']);
 const restPort=port(rest,3000);
 gateway=http.createServer((req,res)=>{
  const isAuth=req.url.startsWith('/auth/v1/'),isRest=req.url.startsWith('/rest/v1/');
  if(!isAuth&&!isRest){res.writeHead(404);res.end();return;}
  const upstream=http.request({hostname:'127.0.0.1',port:isAuth?authPort:restPort,path:req.url.slice(8),method:req.method,headers:req.headers},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});
  upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);
 });
 await new Promise(r=>gateway.listen(0,'127.0.0.1',r));
 const env={...process.env,FSRS_TEST_DB_URL:`postgres://postgres:${password}@127.0.0.1:${port(db,5432)}/${database}`,CONNECT_SECURITY_TEST_URL:`http://127.0.0.1:${gateway.address().port}`};
 for(const key of Object.keys(env))if(/^(SUPABASE|NEXT_PUBLIC_SUPABASE|AZURE|OPENAI|CONNECT_SESSION_ENCRYPTION_KEY)/.test(key))delete env[key];
 const exitCode=await new Promise((resolve,reject)=>{const child=spawn('./node_modules/.bin/vitest',['run','tests/integration/connectSecurity.test.ts','tests/fsrs/securityBoundary.test.ts'],{cwd:path.join(root,'apps/ui'),env,stdio:'inherit'});child.on('error',reject);child.on('exit',resolve);});
 process.exitCode=exitCode??1;
} finally {
 if(gateway)await new Promise(r=>gateway.close(r));
 for(const name of [rest,auth,db])spawnSync('docker',['rm','-f',name],{stdio:'ignore'});
 spawnSync('docker',['network','rm',network],{stdio:'ignore'});
}
