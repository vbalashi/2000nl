import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {publishAppRelease} from './publish-app-release.mjs';
test('release hint uses verified exact commit and server RPC without exposing credentials',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'app-release-'));const envFile=path.join(directory,'.env');
 try{
  await writeFile(envFile,'NEXT_PUBLIC_SUPABASE_URL=https://supabase.example.test\nSUPABASE_SERVICE_ROLE_KEY="secret-test"\n');
  let seen;
  await publishAppRelease({commit:'a'.repeat(40),envFile,environment:{},request:async(url,options)=>{seen={url,options};return{ok:true};}});
  assert.equal(seen.url,'https://supabase.example.test/rest/v1/rpc/publish_app_release_v1');
  assert.deepEqual(JSON.parse(seen.options.body),{p_commit:'a'.repeat(40)});assert.equal(seen.options.headers.Authorization,'Bearer secret-test');
  await assert.rejects(publishAppRelease({commit:'bad',envFile,environment:{}}),/exact release commit/);
  await assert.rejects(publishAppRelease({commit:'b'.repeat(40),envFile,environment:{},request:async()=>({ok:false,status:503})}),/HTTP 503/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
