import {afterAll,beforeAll,describe,expect,test} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {getDbUrl,runMigrations,ensureUserWithSettings,withTransaction} from './dbTestUtils';
const url=getDbUrl();
(url?describe:describe.skip)('account training interactions',()=>{
 const pool=new Pool({connectionString:url});
 beforeAll(()=>runMigrations(pool));afterAll(()=>pool.end());
 test('defaults, persistence and user isolation use the existing settings RLS',async()=>{
  await withTransaction(pool,async client=>{
   const owner=randomUUID(),other=randomUUID();await ensureUserWithSettings(client,owner);await ensureUserWithSettings(client,other);
   const read=await client.query('select training_animation_enabled,training_grade_swipe_enabled,training_translation_swipe_enabled,training_syllable_double_tap_enabled,training_show_syllables,training_audio_swipe_enabled from public.user_settings where user_id=$1',[owner]);
   expect(read.rows[0]).toEqual({training_animation_enabled:true,training_grade_swipe_enabled:false,training_translation_swipe_enabled:false,training_syllable_double_tap_enabled:false,training_show_syllables:false,training_audio_swipe_enabled:false});
   await client.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);await client.query('set local role authenticated');
   expect((await client.query('update public.user_settings set training_animation_enabled=false,training_translation_swipe_enabled=true,training_show_syllables=true,training_audio_swipe_enabled=true where user_id=$1',[owner])).rowCount).toBe(1);
   expect((await client.query('update public.user_settings set training_grade_swipe_enabled=true where user_id=$1',[other])).rowCount).toBe(0);
   expect((await client.query('select user_id from public.user_settings where user_id=$1',[other])).rowCount).toBe(0);
   const reread=await client.query('select training_animation_enabled,training_translation_swipe_enabled,training_show_syllables,training_audio_swipe_enabled from public.user_settings where user_id=$1',[owner]);
   expect(reread.rows[0]).toEqual({training_animation_enabled:false,training_translation_swipe_enabled:true,training_show_syllables:true,training_audio_swipe_enabled:true});
  });
 });
});
