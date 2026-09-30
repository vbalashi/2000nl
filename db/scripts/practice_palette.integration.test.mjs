import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
const target=process.env.LOCAL_SUPABASE_DB_URL, root=path.resolve(import.meta.dirname,'../..');
const psql=(url,input)=>{const result=spawnSync('psql',[url,'-X','-v','ON_ERROR_STOP=1','-At'],{cwd:root,input,encoding:'utf8',timeout:60000});assert.equal(result.status,0,result.stderr);return result.stdout.trim();};
test('account palette preserves text profiles and unrelated settings under own-row RLS', {skip:!target},()=>{
 const url=new URL(target);assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));const name='practice_palette_'+randomUUID().replaceAll('-','');const user=randomUUID(),other=randomUUID();psql(target,'create database '+name+';');url.pathname='/'+name;const db=url.href;
 try{
  psql(db,'\\i db/scripts/plain_postgres_supabase_compat.sql\n\\i db/migrations/bootstrap.sql\n\\i db/deploy-contract/practice-palette-probe.sql');
  psql(db,`insert into auth.users(id,email) values ('${user}','a@example.test'),('${other}','b@example.test'); grant select,insert,update on public.user_settings to authenticated; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    update public.user_settings set preferences='{"sentinel":"keep"}',theme_preference='dark',translation_lang='ru',reading_size_desktop='largest' where user_id='${user}';`);
  const asUser=sql=>`set role authenticated;set request.jwt.claim.sub='${user}';${sql}`;
  psql(db,asUser(`update public.user_settings set practice_palette='blue' where user_id='${user}';`));
  assert.equal(psql(db,asUser(`select practice_palette||':'||reading_size_desktop||':'||theme_preference||':'||translation_lang||':'||(preferences->>'sentinel') from public.user_settings where user_id='${user}';`)).split('\n').at(-1),'blue:largest:dark:ru:keep');
  assert.equal(psql(db,asUser(`select count(*) from public.user_settings where user_id='${other}';`)).split('\n').at(-1),'0');
  psql(db,asUser(`update public.user_settings set practice_palette='graphite' where user_id='${other}';`));
  assert.equal(psql(db,`select practice_palette from public.user_settings where user_id='${other}';`),'lavender');
  const invalid=spawnSync('psql',[db,'-X','-v','ON_ERROR_STOP=1','-c',asUser(`update public.user_settings set practice_palette='invalid' where user_id='${user}';`)],{encoding:'utf8'});assert.notEqual(invalid.status,0);assert.match(invalid.stderr,/user_settings_practice_palette_check/);
  psql(db,'\\i db/migrations/182_account_practice_palette.sql');
  assert.equal(psql(db,`select practice_palette||':'||reading_size_desktop from public.user_settings where user_id='${user}';`),'blue:largest');
 }finally{psql(target,'drop database '+name+' with(force);');}
});
