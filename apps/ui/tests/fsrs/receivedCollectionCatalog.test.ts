import { randomUUID } from 'crypto';
import { writeFileSync } from 'node:fs';
import { Pool, type PoolClient } from 'pg';
import { afterAll,beforeAll,describe,expect,test } from 'vitest';
import { ensureUserWithSettings,getDbUrl,runMigrations,withTransaction } from './dbTestUtils';
const url=getDbUrl();
const principal=(c:PoolClient,id:string)=>c.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);
type Cursor={id:string;key:string;scope:string};
type Row={id:string;name:string;itemCount:number;labelIds:string[]};
const catalog=async(c:PoolClient,sort='name',query='',scope='all',label:string|null=null,cursor:Cursor|null=null,limit=2)=>(await c.query('select read_received_collection_catalog_v1($1,$2,$3,$4,$5,$6) payload',[query,sort,scope,label,cursor,limit])).rows[0].payload as {collections:Row[];nextCursor:Cursor|null;revision:number};
async function fixture(c:PoolClient){
 const owner=randomUUID(),viewer=randomUUID(),outsider=randomUUID();for(const id of [owner,viewer,outsider])await ensureUserWithSettings(c,id);await principal(c,owner);
 const entries:string[]=[];for(let n=0;n<2;n++)entries.push((await c.query('select create_user_dictionary_entry($1,null,$2) id',[owner,{headword:randomUUID(),languageCode:'nl',definition:'lesson '+n}])).rows[0].id);
 const names=['beta','Alpha','alpha','100% lesson','100_ lesson'],counts=[1,2,2,0,1],lists:string[]=[];
 for(let n=0;n<names.length;n++){
  const id=(await c.query('insert into user_word_lists(user_id,name) values($1,$2) returning id',[owner,names[n]])).rows[0].id;lists.push(id);
  for(const entry of entries.slice(0,counts[n]))await c.query('insert into user_word_list_items(list_id,word_id) values($1,$2)',[id,entry]);
  const code=(await c.query("select private.mutate_collection_share_v1($1,'open',$2,0) payload",[randomUUID(),id])).rows[0].payload.invitationCode;
  await principal(c,viewer);await c.query('select private.accept_collection_share_v1($1,$2)',[randomUUID(),code]);await principal(c,owner);
  await c.query("update private.collection_sharing_subscriptions s set accepted_at='2026-01-01T00:00:00Z'::timestamptz+$1*interval '1 day' from private.collection_sharing_roots r where s.root_id=r.id and r.collection_id=$2",[n,id]);
 }
 const parent=randomUUID(),child=randomUUID(),foreign=randomUUID();
 await c.query('select mutate_collection_labels_v1($1,0,$2)',[owner,{type:'create',id:foreign,name:'Author private tag'}]);
 await principal(c,viewer);await c.query('select mutate_collection_labels_v1($1,0,$2)',[viewer,{type:'create',id:parent,name:'YouTube'}]);
 await c.query('select mutate_collection_labels_v1($1,1,$2)',[viewer,{type:'create',id:child,name:'Channel',parent_id:parent}]);
 await c.query('select private.set_received_collection_labels_v1($1,2,$2)',[lists[0],[child]]);
 return {owner,viewer,outsider,entries,lists,names,counts,parent,child,foreign};
}
async function denied(c:PoolClient,action:()=>Promise<unknown>,message:string){await c.query('savepoint bad');await expect(action()).rejects.toThrow(message);await c.query('rollback to savepoint bad');}
(url?describe:describe.skip)('received catalog server query semantics',()=>{
 const pool=new Pool({connectionString:url});beforeAll(()=>runMigrations(pool));afterAll(()=>pool.end());
 test.each(['name','recent','count'])('full %s traversal is globally ordered with unique tie breaks',async sort=>withTransaction(pool,async c=>{
  const f=await fixture(c);await c.query('set local role authenticated');let cursor:Cursor|null=null;const rows:Row[]=[];
  do{const page=await catalog(c,sort,'','all',null,cursor);rows.push(...page.collections);cursor=page.nextCursor;}while(cursor);
  const expected=f.lists.map((id,i)=>({id,i,name:f.names[i].toLowerCase(),count:f.counts[i]})).sort((a,b)=>sort==='name'?(a.name<b.name?-1:a.name>b.name?1:a.id.localeCompare(b.id)):sort==='recent'?b.i-a.i:b.count-a.count||a.id.localeCompare(b.id));
  expect(rows.map(r=>r.id)).toEqual(expected.map(r=>r.id));expect(rows.map(r=>r.itemCount)).toEqual(expected.map(r=>r.count));expect(new Set(rows.map(r=>r.id)).size).toBe(5);
 }));
 test.each([['ALPHA',2],['%',1],['_',1],['missing',0]])('literal case-insensitive search %s precedes pagination',async(query,total)=>withTransaction(pool,async c=>{
  await fixture(c);await c.query('set local role authenticated');expect((await catalog(c,'name',query,'all',null,null,100)).collections).toHaveLength(total);
 }));
 test('personal label descendants and unlabelled operate across the whole scope',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);await c.query('set local role authenticated');
  expect((await catalog(c,'name','','label',f.parent)).collections.map(r=>r.id)).toEqual([f.lists[0]]);
  expect((await catalog(c,'name','','unlabelled',null,null,100)).collections).toHaveLength(4);
  await denied(c,()=>catalog(c,'name','','label',f.foreign),'label_not_found');
  await denied(c,()=>catalog(c,'name','','label',randomUUID()),'label_not_found');
 }));
 test('cursor is bound to account, query, sort and label scope',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);const first=await catalog(c);const cursor=first.nextCursor!;
  await denied(c,()=>catalog(c,'recent','','all',null,cursor),'invalid_catalog_cursor');
  await denied(c,()=>catalog(c,'name','alpha','all',null,cursor),'invalid_catalog_cursor');
  await denied(c,()=>catalog(c,'name','','unlabelled',null,cursor),'invalid_catalog_cursor');
  await principal(c,f.outsider);await denied(c,()=>catalog(c,'name','','all',null,cursor),'invalid_catalog_cursor');expect((await catalog(c)).collections).toEqual([]);
 }));
 test('a live cursor never keeps a collection visible after close',async()=>withTransaction(pool,async c=>{
  const f=await fixture(c);const first=await catalog(c,'recent');await principal(c,f.owner);
  await c.query("select private.mutate_collection_share_v1($1,'close',$2,1)",[randomUUID(),f.lists[0]]);await principal(c,f.viewer);
  const rest=await catalog(c,'recent','','all',null,first.nextCursor);expect(rest.collections.some(r=>r.id===f.lists[0])).toBe(false);
 }));
 test('read RPC requires a principal and grants only authenticated execution',async()=>withTransaction(pool,async c=>{
  await fixture(c);for(const role of ['anon','service_role'])expect((await c.query("select has_function_privilege($1,'read_received_collection_catalog_v1(text,text,text,uuid,jsonb,integer)','EXECUTE') allowed",[role])).rows[0].allowed).toBe(false);
  expect((await c.query("select has_function_privilege('authenticated','read_received_collection_catalog_v1(text,text,text,uuid,jsonb,integer)','EXECUTE') allowed")).rows[0].allowed).toBe(true);
  await principal(c,'');await denied(c,()=>catalog(c),'unauthorized');
 }));
 test('malformed cursors, invalid sort and oversized pages fail closed',async()=>withTransaction(pool,async c=>{
  await fixture(c);await denied(c,()=>catalog(c,'unsupported'),'invalid_catalog_request');await denied(c,()=>catalog(c,'name','','all',null,null,101),'invalid_catalog_request');
  await denied(c,()=>catalog(c,'name','','all',null,{id:randomUUID(),key:'a',scope:'bad'}),'invalid_catalog_cursor');
 }));
 test('search filtering happens before a one-row page boundary',async()=>withTransaction(pool,async c=>{
  await fixture(c);const first=await catalog(c,'name','alpha','all',null,null,1);
  expect(first.collections).toHaveLength(1);expect(first.collections[0].name.toLowerCase()).toBe('alpha');
  expect(first.nextCursor).not.toBeNull();const second=await catalog(c,'name','alpha','all',null,first.nextCursor,1);
  expect(second.collections).toHaveLength(1);expect(second.collections[0].name.toLowerCase()).toBe('alpha');expect(second.collections[0].id).not.toBe(first.collections[0].id);expect(second.nextCursor).toBeNull();
 }));
 test('overlapping collections use a semi-join rather than multiplying membership pairs',async()=>{
  try { await withTransaction(pool,async c=>{
  const f=await fixture(c);await principal(c,f.owner);await c.query("set local statement_timeout='30s'");
  const dictionary=(await c.query('select dictionary_id from word_entries where id=$1',[f.entries[0]])).rows[0].dictionary_id;
  const entries=(await c.query("insert into word_entries(dictionary_id,language_code,headword,meaning_id,raw) select $1,'nl','overlap-'||gen_random_uuid(),1,jsonb_build_object('definition','overlap') from generate_series(1,100) returning id",[dictionary])).rows.map(r=>r.id);
  const lists=(await c.query("insert into user_word_lists(user_id,name) select $1,'overlap '||n from generate_series(1,100) n returning id",[f.owner])).rows.map(r=>r.id);
  await c.query('insert into user_word_list_items(list_id,word_id) select l,e from unnest($1::uuid[]) l cross join unnest($2::uuid[]) e',[lists,entries]);
  await c.query('insert into private.collection_sharing_roots(owner_user_id,collection_id,is_open) select $1,id,true from user_word_lists where id=any($2::uuid[])',[f.owner,lists]);
  await c.query('insert into private.collection_sharing_subscriptions(user_id,root_id,access_lifetime) select $1,id,access_lifetime from private.collection_sharing_roots where collection_id=any($2::uuid[])',[f.viewer,lists]);
  for(const relation of ['word_entries','user_word_list_items','private.collection_sharing_roots','private.collection_sharing_subscriptions'])await c.query('analyze '+relation);
  await principal(c,f.viewer);const result=await catalog(c,'count','','all',null,null,100);expect(result.collections).toHaveLength(100);expect(result.collections.every(r=>r.itemCount===100)).toBe(true);
  const body=(await c.query("select prosrc from pg_proc where oid='read_received_collection_catalog_v1(text,text,text,uuid,jsonb,integer)'::regprocedure")).rows[0].prosrc as string;
  let sql=body.slice(body.indexOf('WITH RECURSIVE labels AS ('),body.lastIndexOf('\n );'));
  const replacements:Record<string,string>={principal:'$1::uuid',query:"''::text",p_sort:"'count'::text",p_scope:"'all'::text",p_label_id:'NULL::uuid',p_limit:'100',after_id:'NULL::uuid',after_key:'NULL::text',after_time:'NULL::timestamptz',after_count:'NULL::bigint',fingerprint:"'local-plan-probe'::text"};
  for(const [key,value] of Object.entries(replacements))sql=sql.replace(new RegExp('\\b'+key+'\\b','g'),value);
  const plan=(await c.query('explain(analyze,buffers,format json) '+sql,[f.viewer])).rows[0]['QUERY PLAN'][0];
  type Plan={ [key:string]:unknown; Plans?:Plan[] };
  const flatten=(node:Plan):Plan[]=>[node,...(node.Plans??[]).flatMap(flatten)];
  const maxRows=Math.max(...flatten(plan.Plan).map(n=>Number(n['Actual Rows']??0)));
  expect(maxRows).toBeLessThan(50000);
  const legacyBody=(await c.query("select prosrc from pg_proc where oid='private.read_received_collection_page_v1(uuid,integer)'::regprocedure")).rows[0].prosrc as string;
  let legacySql=legacyBody.slice(legacyBody.indexOf('WITH candidates AS MATERIALIZED ('),legacyBody.lastIndexOf('\n );'));
  for(const [key,value] of Object.entries({principal:'$1::uuid',p_limit:'100',p_after:'NULL::uuid'}))legacySql=legacySql.replace(new RegExp('\\b'+key+'\\b','g'),value);
  const legacyPlan=(await c.query('explain(analyze,buffers,format json) '+legacySql,[f.viewer])).rows[0]['QUERY PLAN'][0];
  const legacyMaxRows=Math.max(...flatten(legacyPlan.Plan).map(n=>Number(n['Actual Rows']??0)));expect(legacyMaxRows).toBeLessThan(50000);
  if(process.env.RECEIVED_CATALOG_PLAN_PATH)writeFileSync(process.env.RECEIVED_CATALOG_PLAN_PATH,JSON.stringify({fixture:{collections:100,uniqueEntries:100,memberships:10000},maxRows,legacyMaxRows,plan,legacyPlan},null,2));
  }); } finally {
   // ANALYZE can retain reltuples after fixture rollback while pg_stats rolls
   // back. Restore real table statistics rather than weakening release probes.
   for(const relation of ['word_entries','user_word_list_items','private.collection_sharing_roots','private.collection_sharing_subscriptions'])await pool.query('analyze '+relation);
  }
 });

});
