import { afterAll,beforeAll,describe,expect,test } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { ensureUserWithSettings,getDbUrl,runMigrations,withTransaction } from "./dbTestUtils";
const url=getDbUrl();
describe.skipIf(!url)('normal Library category scope',()=>{
 const pool=new Pool({connectionString:url});
 beforeAll(async()=>{await runMigrations(pool);},120000);afterAll(async()=>pool.end());
 test('all categories preserve source, part, article, collection and label selection before pagination',async()=>{
  const reader=randomUUID();const other=randomUUID();
  await withTransaction(pool,async c=>{
   await ensureUserWithSettings(c,reader);await ensureUserWithSettings(c,other);
   const makeDictionary=async()=> (await c.query(`insert into dictionaries(language_code,slug,name,kind,visibility,schema_key,schema_version)
    values('nl',$1,'Scoped fixture','curated','system',public.dictionary_source_settings_v1()->>'schemaKeyV1',1) returning id`,[`scope-${randomUUID()}`])).rows[0].id;
   const enabled=await makeDictionary();const disabled=await makeDictionary();
   const add=async(dictionary:string,headword:string,part:string,gender:string|null)=>{
    const id=(await c.query(`insert into word_entries(dictionary_id,language_code,headword,meaning_id,part_of_speech,gender,raw)
     values($1,'nl',$2,1,$3,$4,$5::jsonb) returning id`,[dictionary,headword,part,gender,JSON.stringify({headword,part_of_speech:part,meanings:[{definition:'Een ontmoeten betekenis.',examples:['We ontmoeten elkaar.','Ze ontmoeten ons.']}]})])).rows[0].id;
    await c.query('select refresh_dictionary_search_document($1,2)',[id]);return id;
   };
   const verb=await add(enabled,'ontmoeten','ww',null);const noun=await add(enabled,'ontmoeting','zn','de');const outside=await add(disabled,'ontmoeten','ww',null);
   await c.query(`update user_settings set material_preferences=$2::jsonb where user_id=$1`,[reader,JSON.stringify({schemaVersion:1,learningLanguages:[{code:'nl',paused:false}],disabledDictionaryIds:[disabled]})]);
   const list=(await c.query(`insert into user_word_lists(user_id,name) values($1,'Scoped list') returning id`,[reader])).rows[0].id;
   await c.query(`insert into user_word_list_items(list_id,word_id) values($1,$2),($1,$3)`,[list,verb,noun]);
   const material={kind:'collection',id:list,collectionType:'user'};
   const read=async(group:string,filters:unknown={parts:[],article:null},selection:unknown=null,dicts:string[]|null=null,cursor:string|null=null,limit=100)=> (await c.query(`select search_library_category_v1($1,'ontmoeten','nl',$2,$3::jsonb,$4::jsonb,$5,$6,$7) result`,[reader,dicts,JSON.stringify(filters),selection?JSON.stringify(selection):null,group,limit,cursor])).rows[0].result;
   for(const group of ['headwords','examples','definitions','alphabetical']){
    const result=await read(group,{parts:['verb'],article:null},material);
    expect(result.groups[0].items.length).toBeGreaterThan(0);
    expect(result.groups[0].items.every((hit:any)=>hit.entry.id===verb)).toBe(true);
    expect(result.groups[0].items.some((hit:any)=>hit.entry.id===outside)).toBe(false);
    expect((await read(group,{parts:['noun'],article:'het'},material)).groups[0].items).toEqual([]);
    expect((await read(group,undefined,null,[disabled])).groups[0].items).toEqual([]);
    expect((await read(group,undefined,null,[])).groups[0].items).toEqual([]);
   }
   const label=(await c.query(`insert into private.collection_labels(user_id,name) values($1,'Label') returning id`,[reader])).rows[0].id;
   await c.query(`insert into private.collection_label_assignments(user_id,label_id,collection_id) values($1,$2,$3)`,[reader,label,list]);
   expect((await read('examples',undefined,{kind:'label',id:label})).groups[0].items).toHaveLength(4);
   const page=await read('examples',undefined,material,null,null,1);
   expect(page.groups[0].page.hasMore).toBe(true);
   expect((await read('examples',{parts:['verb'],article:null},material,null,page.groups[0].page.nextCursor,1)).error).toBe('invalid_cursor');
   await c.query('delete from user_word_list_items where list_id=$1 and word_id=$2',[list,noun]);
   expect((await read('examples',undefined,material,null,page.groups[0].page.nextCursor,1)).error).toBe('invalid_cursor');
   const forbidden=(await c.query(`insert into user_word_lists(user_id,name) values($1,'Other list') returning id`,[other])).rows[0].id;
   expect((await read('headwords',undefined,{kind:'collection',id:forbidden,collectionType:'user'})).error).toBe('material_not_accessible');
   expect((await c.query(`select has_function_privilege('authenticated','public.search_library_category_v1(uuid,text,text,uuid[],jsonb,jsonb,text,integer,text)','EXECUTE') allowed`)).rows[0].allowed).toBe(false);
  },reader);
 });
 test('shared author entries stay searchable without exposing unshared siblings',async()=>{
  const owner=randomUUID(),viewer=randomUUID();
  await withTransaction(pool,async c=>{
   await ensureUserWithSettings(c,owner);await ensureUserWithSettings(c,viewer);
   const add=async(headword:string)=>{
    const id=(await c.query("select create_user_dictionary_entry($1,null,$2) id",[owner,{headword,languageCode:'nl',definition:'Elkaar ontmoeten.'}])).rows[0].id;
    await c.query("update word_entries set raw=$2::jsonb where id=$1",[id,{meanings:[{definition:'Elkaar ontmoeten.',examples:['We ontmoeten elkaar.']}]}]);
    await c.query('select refresh_dictionary_search_document($1,2)',[id]);return id;
   };
   const shared=await add('ontmoeten'),hidden=await add('ontmoeten-hidden');
   const list=(await c.query("insert into user_word_lists(user_id,name) values($1,'Shared search') returning id",[owner])).rows[0].id;
   await c.query('insert into user_word_list_items(list_id,word_id) values($1,$2)',[list,shared]);
   const root=(await c.query('insert into private.collection_sharing_roots(owner_user_id,collection_id,is_open) values($1,$2,true) returning id,access_lifetime',[owner,list])).rows[0];
   await c.query('insert into private.collection_sharing_subscriptions(user_id,root_id,access_lifetime) values($1,$2,$3)',[viewer,root.id,root.access_lifetime]);
   for(const group of ['headwords','examples','definitions','alphabetical']){
    const result=(await c.query("select search_library_category_v1($1,'ontmoeten','nl',null,'{}',$2,$3) result",[viewer,{kind:'collection',id:list,collectionType:'user'},group])).rows[0].result;
    expect(result.error).toBeUndefined();
    expect(result.groups[0].items.length).toBeGreaterThan(0);
    expect(result.groups[0].items.every((hit:any)=>hit.entry.id===shared)).toBe(true);
    expect(result.groups[0].items.some((hit:any)=>hit.entry.id===hidden)).toBe(false);
   }
  },owner);
 });

});
