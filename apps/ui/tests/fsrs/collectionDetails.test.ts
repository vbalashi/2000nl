import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {beforeAll,afterAll,describe,test,expect} from 'vitest';
import {getDbUrl,runMigrations,ensureUserWithSettings,withTransaction} from './dbTestUtils';
const url=getDbUrl();
(url?describe:describe.skip)('collection details access and persistence',()=>{
 const pool=new Pool({connectionString:url});beforeAll(()=>runMigrations(pool),120000);afterAll(()=>pool.end());
 test('owner updates are visible to accepted readers, conflict on rename, and revoked access fails closed',async()=>withTransaction(pool,async c=>{
  const owner=randomUUID(),reader=randomUUID(),outsider=randomUUID();for(const id of [owner,reader,outsider])await ensureUserWithSettings(c,id);
  const actor=(id:string)=>c.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);
  await actor(owner);const id=(await c.query("insert into user_word_lists(user_id,name) values($1,'Before') returning id",[owner])).rows[0].id;
  const read=async()=> (await c.query('select read_collection_details_v1($1) value',[id])).rows[0].value;
  const save=async(rev:string,patch:unknown)=>(await c.query('select update_collection_details_v1($1,$2,$3) value',[id,rev,patch])).rows[0].value;
  const initial=await read();expect(initial).toMatchObject({name:'Before',source:null,revision:'0',isOwner:true});
  const first=await save(initial.revision,{name:'After',description:'Description',source:{materialKind:'video',originKind:'youtube',creatorName:'Channel',publishedOn:'2024-02-29',url:'https://example.com/video'}});
  expect(first).toMatchObject({name:'After',revision:'1',source:{creatorName:'Channel',publishedOn:'2024-02-29'}});
  const share=(await c.query("select private.mutate_collection_share_v1($1,'open',$2,0) value",[randomUUID(),id])).rows[0].value;
  await actor(reader);await c.query('select private.accept_collection_share_v1($1,$2)',[randomUUID(),share.invitationCode]);
  await c.query('set local role authenticated');expect(await read()).toMatchObject({name:'After',isOwner:false,source:{creatorName:'Channel'}});
  await c.query('savepoint denied');await expect(save('1',{name:'Stolen'})).rejects.toThrow('collection_unavailable');await c.query('rollback to savepoint denied');await c.query('reset role');
  await actor(owner);const cleared=await save('1',{source:{publishedOn:null,creatorName:'New author'}});expect(cleared.source).toMatchObject({publishedOn:null,creatorName:'New author',materialKind:'video'});
  await actor(reader);expect(await read()).toMatchObject({source:{publishedOn:null,creatorName:'New author'}});
  await actor(owner);await c.query('select update_user_word_list($1,$2,$3)',[owner,id,'Renamed']);
  await c.query('savepoint conflict');await expect(save(cleared.revision,{description:null})).rejects.toThrow('details_conflict');await c.query('rollback to savepoint conflict');
  expect((await read()).name).toBe('Renamed');
  const removed=await save((await read()).revision,{description:null,source:null});expect(removed).toMatchObject({name:'Renamed',description:null,source:null});
  for(const date of ['2023-02-29','2024-13-01','2024-02-30']){const rev=(await read()).revision;await c.query('savepoint invalid');await expect(save(rev,{source:{publishedOn:date}})).rejects.toThrow('invalid_details');await c.query('rollback to savepoint invalid');}
  for(const unsafe of ['javascript:alert(1)','file:///private','https://example.com/ bad']){const rev=(await read()).revision;await c.query('savepoint unsafe_url');await expect(save(rev,{source:{url:unsafe}})).rejects.toThrow('invalid_details');await c.query('rollback to savepoint unsafe_url');}
  await c.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),id]);
  await actor(reader);await c.query('savepoint revoked');await expect(read()).rejects.toThrow('collection_unavailable');await c.query('rollback to savepoint revoked');
  await actor(outsider);await c.query('savepoint forbidden');await expect(read()).rejects.toThrow('collection_unavailable');await c.query('rollback to savepoint forbidden');
  for(const role of ['anon','service_role'])expect((await c.query("select has_function_privilege($1,'public.read_collection_details_v1(uuid)','execute') allowed",[role])).rows[0].allowed).toBe(false);
 }));
 test('simultaneous saves with the same revision permit only one writer',async()=>{
  const owner=randomUUID();const seed=await pool.connect();let id:string;
  try{await ensureUserWithSettings(seed,owner);id=(await seed.query("insert into user_word_lists(user_id,name) values($1,'Concurrent') returning id",[owner])).rows[0].id;}finally{seed.release();}
  const a=await pool.connect(),b=await pool.connect();try{
   await Promise.all([a.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]),b.query("select set_config('request.jwt.claim.sub',$1,false)",[owner])]);
   const results=await Promise.allSettled([a.query("select update_collection_details_v1($1,'0',$2)",[id,{description:'A'}]),b.query("select update_collection_details_v1($1,'0',$2)",[id,{description:'B'}])]);
   expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);const rejected=results.find(result=>result.status==='rejected');expect(rejected?.status==='rejected'&&rejected.reason.code).toBe('40001');
  }finally{a.release();b.release();}
 });
 test('group-only subscribers read details only while group access is live',async()=>withTransaction(pool,async c=>{
  const owner=randomUUID(),reader=randomUUID(),label=randomUUID();for(const id of [owner,reader])await ensureUserWithSettings(c,id);
  const actor=(id:string)=>c.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);await actor(owner);
  const id=(await c.query("insert into user_word_lists(user_id,name) values($1,'Group lesson') returning id",[owner])).rows[0].id;
  await c.query("insert into private.collection_labels(id,user_id,name) values($1,$2,'Group')",[label,owner]);await c.query('insert into private.collection_label_assignments values($1,$2,$3)',[owner,id,label]);
  await c.query("select update_collection_details_v1($1,'0',$2)",[id,{source:{creatorName:'Group author'}}]);
  const group=(await c.query("select mutate_label_share_v1($1,'open',0) value",[label])).rows[0].value;await actor(reader);await c.query('select accept_label_share_v1($1)',[group.invitationCode]);
  await c.query('set local role authenticated');expect((await c.query('select read_collection_details_v1($1) value',[id])).rows[0].value).toMatchObject({isOwner:false,source:{creatorName:'Group author'}});await c.query('reset role');
  await actor(owner);await c.query("select mutate_label_share_v1($1,'close',1)",[label]);await actor(reader);await c.query('set local role authenticated');
  await c.query('savepoint revoked_group');await expect(c.query('select read_collection_details_v1($1)',[id])).rejects.toThrow('collection_unavailable');await c.query('rollback to savepoint revoked_group');
 }));
});
