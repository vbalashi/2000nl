import {randomUUID} from 'crypto';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,test} from 'vitest';
import {ensureUserWithSettings,getDbUrl,runMigrations,withTransaction} from './dbTestUtils';
const url=getDbUrl();
(url?describe:describe.skip)('exact selected collection membership',()=>{
 const pool=new Pool({connectionString:url});beforeAll(()=>runMigrations(pool));afterAll(()=>pool.end());
 test('received membership never includes offcollection/private siblings and closes with authority',async()=>withTransaction(pool,async c=>{
  const owner=randomUUID(),viewer=randomUUID(),outsider=randomUUID();for(const id of [owner,viewer,outsider])await ensureUserWithSettings(c,id);
  const principal=(id:string)=>c.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);await principal(owner);
  const entries:string[]=[];for(let n=0;n<2;n++)entries.push((await c.query('select create_user_dictionary_entry($1,null,$2) id',[owner,{headword:'same-'+randomUUID(),languageCode:'nl',definition:'meaning '+n}])).rows[0].id);
  const list=(await c.query('insert into user_word_lists(user_id,name) values($1,$2) returning id',[owner,'lesson'])).rows[0].id;
  await c.query('insert into user_word_list_items(list_id,word_id) values($1,$2)',[list,entries[0]]);
  const code=(await c.query("select private.mutate_collection_share_v1($1,'open',$2,0) payload",[randomUUID(),list])).rows[0].payload.invitationCode;
  const read=async()=>(await c.query('select read_selected_collection_membership_v1($1,$2) payload',[list,entries])).rows[0].payload;
  await principal(viewer);await c.query('select private.accept_collection_share_v1($1,$2)',[randomUUID(),code]);await c.query('set local role authenticated');
  expect(await read()).toEqual({collectionId:list,includedEntryIds:[entries[0]]});
  await principal(outsider);expect(await read()).toBeNull();await principal(owner);expect(await read()).toEqual({collectionId:list,includedEntryIds:[entries[0]]});
  await c.query('reset role');await c.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),list]);await principal(viewer);await c.query('set local role authenticated');expect(await read()).toBeNull();
 }));
});
