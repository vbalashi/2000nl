import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
const require=createRequire(new URL('../../apps/ui/package.json',import.meta.url));
const {createClient}=require('@supabase/supabase-js');
const enabled=process.env.APP_EVENTS_REALTIME_SMOKE==='1';
const db=process.env.LOCAL_SUPABASE_DB_URL;
function sql(input){const r=spawnSync('psql',[db,'-X','-qAt','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const opts={auth:{persistSession:false,autoRefreshToken:false}};
function join(client,topic,events){return new Promise(resolve=>{
 const channel=client.channel(topic,{config:{private:true}}).on('broadcast',{event:'app-event'},event=>events.push(event.payload));
 const timer=setTimeout(()=>resolve({channel,status:'TEST_TIMEOUT'}),12000);
 channel.subscribe((status,error)=>{if(error)console.log(topic,status,error.message);if(['SUBSCRIBED','CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){clearTimeout(timer);resolve({channel,status});}});
});}
test('local Supabase WebSocket private topics deliver real DB broadcasts and deny foreign readers',{skip:!enabled,timeout:55000},async()=>{
 assert.ok(db);assert.ok(['127.0.0.1','localhost','[::1]'].includes(new URL(db).hostname));
 const endpoint=process.env.NEXT_PUBLIC_SUPABASE_URL;assert.ok(['127.0.0.1','localhost'].includes(new URL(endpoint).hostname));
 const admin=createClient(endpoint,process.env.SUPABASE_SERVICE_ROLE_KEY,opts),clients=[],users=[],suffix=randomUUID(),dictionary=randomUUID(),entry=randomUUID();
 try{
  for(let i=0;i<2;i++){
   const email=`realtime-${suffix}-${i}@example.test`,password=`Smoke-${randomUUID()}!`;
   const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.ifError(created.error);users.push(created.data.user.id);
   const client=createClient(endpoint,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,opts);clients.push(client);
   const login=await client.auth.signInWithPassword({email,password});assert.ifError(login.error);await client.realtime.setAuth(login.data.session.access_token);
  }
  sql(`INSERT INTO public.dictionaries(id,language_code,slug,name,kind,visibility,owner_user_id,publication_state) VALUES('${dictionary}','nl','event-${suffix}','Events smoke','user','private','${users[0]}','unpublished');
    INSERT INTO public.word_entries(id,dictionary_id,language_code,headword,raw) VALUES('${entry}','${dictionary}','nl','testwoord','{}');`);
  const events=[],first=await join(clients[0],`app:user:${users[0]}`,events);assert.equal(first.status,'SUBSCRIBED');
  const foreign=await join(clients[1],`app:user:${users[0]}`,[]);assert.equal(foreign.status,'CHANNEL_ERROR');
  const translation=await join(clients[0],`app:translation:${entry}:ru`,events);assert.equal(translation.status,'SUBSCRIBED');
  const privateForeign=await join(clients[1],`app:translation:${entry}:ru`,[]);assert.equal(privateForeign.status,'CHANNEL_ERROR');
  const anon=createClient(endpoint,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,opts);clients.push(anon);
  const anonymous=await join(anon,'app:releases',[]);assert.equal(anonymous.status,'CHANNEL_ERROR');
  const release=await join(clients[0],'app:releases',events);assert.equal(release.status,'SUBSCRIBED');
  sql(`UPDATE public.user_settings SET translation_lang='fr' WHERE user_id='${users[0]}';
    INSERT INTO public.word_entry_translations(word_entry_id,target_lang,provider,status,overlay) VALUES('${entry}','ru','openai','ready','{}');
    SELECT public.publish_app_release_v1(repeat('a',40));`);
  for(let n=0;n<25 && new Set(events.map(e=>e.kind)).size<3;n++)await pause(200);
  assert.deepEqual(new Set(events.map(e=>e.kind)),new Set(['account.changed','translation.ready','release.available']));
  for(const event of events){assert.equal(event.version,1);assert.ok(event.eventId);assert.ok(!('overlay'in event));assert.ok(!('user_id'in event));}
  console.log('Real WS: owner receives account + private translation + release; second user and anon denied');
 }finally{
  for(const client of [...clients,admin]){await client.removeAllChannels();client.realtime.disconnect();}
  sql(`DELETE FROM public.word_entries WHERE id='${entry}'; DELETE FROM public.dictionaries WHERE id='${dictionary}';`);
  for(const id of users){const r=await admin.auth.admin.deleteUser(id);assert.ifError(r.error);}
 }
});
