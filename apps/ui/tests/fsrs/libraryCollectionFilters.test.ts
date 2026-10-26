import {beforeAll,afterAll,describe,expect,test} from "vitest";
import {Pool,PoolClient} from "pg";
import {randomUUID} from "crypto";
import {readFileSync} from "node:fs";
import path from "node:path";
import {getDbUrl,runMigrations,withTransaction,ensureUserWithSettings,insertWord} from "./dbTestUtils";
const url=getDbUrl();
const suite=url?describe:describe.skip;
suite("Library collection POS/article predicate",()=>{
 const pool=new Pool({connectionString:url});
 beforeAll(async()=>{await runMigrations(pool);await pool.query(readFileSync(path.resolve(process.cwd(),"../../db/deploy-contract/library-collection-filters-probe.sql"),"utf8"));});afterAll(()=>pool.end());
 async function fixture(c:PoolClient,owner:string){
  await ensureUserWithSettings(c,owner);
  const list=(await c.query("insert into user_word_lists(user_id,name,language_code,primary_language_code) values($1,'Lesson','nl','nl') returning id",[owner])).rows[0].id;
  const ids:string[]=[];
  for(const [name,pos,gender]of [["de-noun","zn","de"],["het-noun","noun","het"],["both-noun","zn","de/het"],["verb","ww",null],["adj","bn",null]]){
   const id=await insertWord(c,name!);ids.push(id);
   await c.query("update word_entries set part_of_speech=$2,gender=$3 where id=$1",[id,pos,gender]);
   await c.query("insert into user_word_list_items(list_id,word_id) values($1,$2)",[list,id]);
  }
  return {list,ids};
 }
 async function read(c:PoolClient,list:string,parts:string[]=[],article:string|null=null,page=1,size=1,language="nl",type="user"){
  return (await c.query("select fetch_library_collection_entries($1,$2,$3::jsonb,null,$4,$5,$6) as result",[list,type,JSON.stringify({parts,article}),language,page,size])).rows[0].result;
 }
 test("filters before count/pagination; de/het affect only the noun branch",async()=>{
  const owner=randomUUID();await withTransaction(pool,async c=>{
   const {list,ids}=await fixture(c,owner);
   await c.query("set local role authenticated");
   const pages=await Promise.all([1,2,3].map(p=>read(c,list,["noun","verb"],"de",p)));
   expect(pages.map(p=>p.total)).toEqual([3,3,3]);
   expect(pages.flatMap(p=>p.items.map((x:{id:string})=>x.id)).sort()).toEqual([ids[0],ids[2],ids[3]].sort());
   expect((await read(c,list,["noun"],"het",1,10)).items.map((x:{id:string})=>x.id).sort()).toEqual([ids[1],ids[2]].sort());
   expect((await read(c,list,[],null,1,10)).total).toBe(5);
   expect((await read(c,list,["verb"],null,1,10)).items.map((x:{id:string})=>x.id)).toEqual([ids[3]]);
   expect((await read(c,list,[],null,1,10,"en")).total).toBe(0);
   expect((await read(c,list,["noun","verb"],"de",4)).items).toEqual([]);
  },owner);
 });
 test("user-list ownership and auth role guard counts and items",async()=>{
  const owner=randomUUID(),other=randomUUID();await withTransaction(pool,async c=>{
   const {list}=await fixture(c,owner);await ensureUserWithSettings(c,other);
   await c.query("select set_config('request.jwt.claim.sub',$1,true)",[other]);
   await c.query("set local role authenticated");
   expect(await read(c,list,["noun"],"de")).toMatchObject({items:[],total:0});
   await c.query("reset role");
   const grants=(await c.query("select has_function_privilege('anon','public.fetch_library_collection_entries(uuid,text,jsonb,text,text,integer,integer)','execute') as allowed")).rows[0];
   expect(grants.allowed).toBe(false);
  },owner);
 });
 test("curated and owned list membership cannot expose an inaccessible dictionary",async()=>{
  const owner=randomUUID(),other=randomUUID();await withTransaction(pool,async c=>{
   const {list,ids}=await fixture(c,owner);await ensureUserWithSettings(c,other);
   const d=(await c.query(`insert into dictionaries(language_code,slug,name,kind,visibility,owner_user_id,is_editable,schema_key,schema_version) values('nl',$1,'Private','user','private',$2,true,'user-entry-v1',1) returning id`,[randomUUID(),other])).rows[0].id;
   await c.query("select set_config('request.jwt.claim.sub',$1,true)",[other]);
   const secret=(await c.query("insert into word_entries(dictionary_id,language_code,headword,meaning_id,part_of_speech,gender,raw) values($1,'nl','secret',1,'noun','de','{}') returning id",[d])).rows[0].id;
   await c.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
   await c.query("delete from user_word_list_items where list_id=$1 and word_id=$2",[list,ids[0]]);
   await c.query("insert into user_word_list_items(list_id,word_id) values($1,$2)",[list,secret]);
   ids[0]=secret;
   const curated=(await c.query("insert into word_lists(language_code,primary_language_code,name,slug,is_primary) values('nl','nl','Curated',$1,false) returning id",[randomUUID()])).rows[0].id;
   for(let i=0;i<ids.length;i++)await c.query("insert into word_list_items(list_id,word_id,rank) values($1,$2,$3)",[curated,ids[i],i]);
   await c.query("set local role authenticated");
   for(const [id,type]of [[list,"user"],[curated,"curated"]]){
    const result=await read(c,id,["noun","verb"],"de",1,100,"nl",type);
    expect(result.total).toBe(2);
    expect(result.items.map((x:{id:string})=>x.id).sort()).toEqual([ids[2],ids[3]].sort());
    const query=(await c.query("select fetch_library_collection_entries($1,$2,$3::jsonb,'both','nl',1,1) as result",[id,type,JSON.stringify({parts:["noun","verb"],article:"de"})])).rows[0].result;
    expect(query.total).toBe(1);expect(query.items[0].id).toBe(ids[2]);
   }
  },owner);
 });
 test("Library uses browse policy: general Premium sources visible, another user's personal source hidden",async()=>{
  const owner=randomUUID(),author=randomUUID();await withTransaction(pool,async c=>{
   const {list}=await fixture(c,owner);await ensureUserWithSettings(c,author);
   await c.query("update user_settings set subscription_tier='free' where user_id=$1",[owner]);
   const entries:string[]=[];
   for(const kind of ["curated","user"]){
    const d=(await c.query(`insert into dictionaries(language_code,slug,name,kind,visibility,publication_state,owner_user_id,minimum_subscription_tier,is_editable,schema_key,schema_version)
      values('nl',$1,'Browse fixture',$2,'public','general',$3,'premium',true,'user-entry-v1',1) returning id`,[randomUUID(),kind,author])).rows[0].id;
    await c.query("update dictionaries set publication_state='general' where id=$1",[d]);
    await c.query("select set_config('request.jwt.claim.sub',$1,true)",[author]);
    const entry=(await c.query("insert into word_entries(dictionary_id,language_code,headword,meaning_id,part_of_speech,raw) values($1,'nl',$2,1,'noun','{}') returning id",[d,kind])).rows[0].id;
    entries.push(entry);await c.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
    await c.query("insert into user_word_list_items(list_id,word_id) values($1,$2)",[list,entry]);
   }
   await c.query("set local role authenticated");
   const result=await read(c,list,[],null,1,100);
   expect(result.items.map((item:{id:string})=>item.id)).toContain(entries[0]);
   expect(result.items.map((item:{id:string})=>item.id)).not.toContain(entries[1]);
   expect(result.total).toBe(6);
  },owner);
 });
 test("Free100 limit leaves the full filtered count but never returns entry101",async()=>{
  const owner=randomUUID();await withTransaction(pool,async c=>{
   const {list}=await fixture(c,owner);
   await c.query("update user_settings set subscription_tier='free' where user_id=$1",[owner]);
   for(let i=0;i<96;i++){const id=await insertWord(c,`cap-${i}`);await c.query("insert into user_word_list_items(list_id,word_id) values($1,$2)",[list,id]);}
   await c.query("set local role authenticated");
   expect(await read(c,list,[],null,1,100)).toMatchObject({total:101,is_locked:false,max_allowed:100});
   expect((await read(c,list,[],null,1,100)).items).toHaveLength(100);
   expect(await read(c,list,[],null,2,100)).toMatchObject({total:101,is_locked:true,items:[]});
  },owner);
 });
 test("invalid filters and unauthenticated requests fail explicitly",async()=>{
  const owner=randomUUID();await withTransaction(pool,async c=>{
   const {list}=await fixture(c,owner);
   await expect(read(c,list,["verb"],"de")).rejects.toThrow("invalid_library_filters");
  },owner);
  await withTransaction(pool,async c=>{await c.query("select set_config('request.jwt.claim.sub','',true)");await expect(read(c,randomUUID())).rejects.toThrow("not_authenticated");});
 });
});
