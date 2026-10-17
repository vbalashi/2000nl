import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
const root=path.resolve(import.meta.dirname,'../..');
const target=process.env.LOCAL_SUPABASE_DB_URL;
function sql(url,input) {
  const result=spawnSync('psql',[url,'-X','-q','-v','ON_ERROR_STOP=1','-At'],{cwd:root,input,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
  assert.equal(result.status,0,result.stderr); return result.stdout.trim();
}
test('shared app events preserve writes, coalesce hints and reject foreign/forged subscriptions', {skip:!target},()=>{
  const url=new URL(target); assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname));
  const name=`app_events_${randomUUID().replaceAll('-','')}`;sql(target,`CREATE DATABASE ${name}`);url.pathname=`/${name}`;const db=url.href;
  const user=randomUUID(),other=randomUUID(),entry=randomUUID(),dictionary=randomUUID();
  try {
    sql(db,'\\i db/scripts/plain_postgres_supabase_compat.sql\n\\i db/migrations/bootstrap.sql\n\\i db/deploy-contract/shared-app-events-probe.sql');
    sql(db,`INSERT INTO auth.users(id,email) VALUES('${user}','events-a@example.test'),('${other}','events-b@example.test');
      INSERT INTO public.user_settings(user_id) VALUES('${user}'),('${other}') ON CONFLICT DO NOTHING;
      TRUNCATE realtime.messages;
      BEGIN;
      UPDATE public.user_settings SET translation_lang='ru' WHERE user_id='${user}';
      UPDATE public.user_settings SET translation_lang='en' WHERE user_id='${user}';
      COMMIT;`);
    assert.equal(sql(db,"SELECT count(*) FROM realtime.messages WHERE payload->>'kind'='account.changed'"),'1');
    const message=JSON.parse(sql(db,'SELECT payload FROM realtime.messages LIMIT 1'));
    assert.equal(message.resourceId,'user_settings');assert.equal(message.version,1);assert.ok(message.eventId);assert.ok(message.occurredAt);assert.match(message.id,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    assert.deepEqual(Object.keys(message).sort(),['eventId','id','kind','occurredAt','resourceId','revision','version']);
    sql(db,`INSERT INTO public.dictionaries(id,language_code,slug,name,kind,visibility,owner_user_id,publication_state)
      VALUES('${dictionary}','nl','events-integration','Event integration','user','private','${user}','unpublished');
      INSERT INTO public.word_entries(id,dictionary_id,language_code,headword,raw) VALUES('${entry}','${dictionary}','nl','testwoord','{}');
      TRUNCATE realtime.messages;
      BEGIN;
      INSERT INTO public.word_entry_translations(word_entry_id,target_lang,provider,status,overlay)
        VALUES('${entry}','ru','openai','ready','{}');
      INSERT INTO public.dictionary_translation_jobs(word_entry_id,target_lang,provider,source_fingerprint,source_row_revision,source_content_revision,translation_policy_version,provider_revision,status)
        VALUES('${entry}','ru','openai','fp',repeat('a',64),'source','policy','provider','ready');
      COMMIT;`);
    assert.equal(sql(db,"SELECT count(*) FROM realtime.messages WHERE payload->>'kind'='translation.ready'"),'1');
    sql(db,`INSERT INTO public.dictionary_translation_jobs(word_entry_id,target_lang,provider,source_fingerprint,source_row_revision,source_content_revision,translation_policy_version,provider_revision,status)
      VALUES('${entry}','de','openai','fp',repeat('a',64),'source','policy','provider','failed');`);
    assert.equal(sql(db,"SELECT count(*) FROM realtime.messages WHERE payload->>'kind'='translation.failed'"),'1');
    sql(db,`TRUNCATE realtime.messages; UPDATE public.user_settings SET translation_lang='de' WHERE user_id='${user}';`);
    // Real policy logic with non-superuser role; model intentionally grants a broad
    // unrelated permissive policy to prove restrictive app guards still win.
    sql(db,`CREATE POLICY unrelated_broad_select ON realtime.messages FOR SELECT TO authenticated,anon USING(true);
      CREATE POLICY unrelated_broad_insert ON realtime.messages FOR INSERT TO authenticated,anon WITH CHECK(true);
      GRANT SELECT,INSERT ON realtime.messages TO anon; GRANT USAGE ON SCHEMA realtime TO anon;`);
    const asPrincipal=(topic,statement)=>`RESET ROLE; SET request.jwt.claim.sub='${user}'; SET realtime.topic='${topic}'; ${statement}`;
    const asUser=(topic,statement)=>`SET ROLE authenticated; SET request.jwt.claim.sub='${user}'; SET realtime.topic='${topic}'; ${statement}`;
    assert.equal(sql(db,asUser(`app:user:${user}`,'SELECT count(*) FROM realtime.messages')),'1');
    assert.equal(sql(db,asUser(`app:user:${other}`,'SELECT count(*) FROM realtime.messages')),'0');
    assert.equal(sql(db,`SET ROLE anon; SET realtime.topic='app:user:${user}'; SELECT count(*) FROM realtime.messages`),'0');
    assert.equal(sql(db,asPrincipal(`app:translation:${entry}:ru`,"SELECT private.can_receive_app_event_v1(realtime.topic())")),'t');
    assert.equal(sql(db,`SET request.jwt.claim.sub='${other}'; SET realtime.topic='app:translation:${entry}:ru'; SELECT private.can_receive_app_event_v1(realtime.topic())`),'f');
    assert.equal(sql(db,asPrincipal('app:translation:bad:ru',"SELECT private.can_receive_app_event_v1(realtime.topic())")),'f');
    assert.equal(sql(db,asPrincipal('app:releases',"SELECT private.can_receive_app_event_v1(realtime.topic())")),'t');
    const forged=spawnSync('psql',[db,'-X','-v','ON_ERROR_STOP=1','-c',asUser(`app:user:${user}`,`INSERT INTO realtime.messages(topic,payload) VALUES('app:user:${user}','{}')`)],{encoding:'utf8'});
    assert.notEqual(forged.status,0);assert.match(forged.stderr,/row-level security/);
    // Supabase adds transport metadata without replacing an explicit provider id.
    const suppliedId=randomUUID();
    sql(db,`SELECT realtime.send(jsonb_build_object('id','${suppliedId}'),'metadata-test','test:transport',true);`);
    assert.equal(sql(db,"SELECT payload->>'id' FROM realtime.messages WHERE event='metadata-test'"),suppliedId);
    // Rollback never leaks a committed event.
    sql(db,`TRUNCATE realtime.messages; BEGIN; UPDATE public.user_settings SET translation_lang='de' WHERE user_id='${user}'; ROLLBACK;`);
    assert.equal(sql(db,'SELECT count(*) FROM realtime.messages'),'0');
    // Transport failure cannot change authoritative accepted mutation outcome.
    sql(db,`CREATE OR REPLACE FUNCTION realtime.send(payload jsonb,event text,topic text,private boolean DEFAULT true)
      RETURNS void LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'offline'; END $$;
      UPDATE public.user_settings SET translation_lang='fr' WHERE user_id='${user}';`);
    assert.equal(sql(db,`SELECT translation_lang FROM public.user_settings WHERE user_id='${user}'`),'fr');
  } finally {sql(target,`DROP DATABASE ${name} WITH (FORCE)`);}
});
