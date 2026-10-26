import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ensureUserWithSettings, getDbUrl, runMigrations, withTransaction } from "./dbTestUtils";

const url=getDbUrl();
type Plan = { [key:string]: unknown; Plans?: Plan[] };
function flatten(plan:Plan):Plan[] { return [plan,...(plan.Plans??[]).flatMap(flatten)]; }

(url && process.env.SHARED_ACCESS_SCALE==="1" ? describe : describe.skip)("shared entry scale gate (disposable only)",()=>{
  const pool=new Pool({connectionString:url});
  beforeAll(()=>runMigrations(pool)); afterAll(()=>pool.end());
  test("point access does not visit a100k-entry scope, including a generic cached plan",async()=>{
    await withTransaction(pool,async c=>{
      const owner=randomUUID(), viewer=randomUUID(), outsider=randomUUID();
      for(const user of [owner,viewer,outsider]) await ensureUserWithSettings(c,user);
      await c.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
      const dictionary=(await c.query("select ensure_user_dictionary($1,'nl','scale fixture') id",[owner])).rows[0].id;
      await c.query("set local statement_timeout='120s'");
      await c.query("create temporary table scale_entry_ids(n integer primary key,id uuid not null) on commit drop");
      await c.query("insert into scale_entry_ids select n,gen_random_uuid() from generate_series(1,100000) n");
      // This benchmark isolates access planning, not rich-content ingestion.
      // Keep management/archive/version/FK/RLS and sharing guards enabled.
      for(const trigger of ["trg_ensure_platform_v2_user_group","trg_reconcile_platform_v2_user_entry"]) await c.query(`alter table word_entries disable trigger ${trigger}`);
      await c.query("insert into word_entries(id,dictionary_id,language_code,headword,meaning_id,raw) select id,$1,'nl','scale-'||n,1,jsonb_build_object('definition','definition '||n) from scale_entry_ids",[dictionary]);
      for(const trigger of ["trg_ensure_platform_v2_user_group","trg_reconcile_platform_v2_user_entry"]) await c.query(`alter table word_entries enable trigger ${trigger}`);
      await c.query("create temporary table scale_list_ids(n integer primary key,id uuid not null) on commit drop");
      await c.query("insert into scale_list_ids select n,gen_random_uuid() from generate_series(1,1000) n");
      await c.query("insert into user_word_lists(id,user_id,name) select id,$1,'scale '||n from scale_list_ids",[owner]);
      await c.query("insert into user_word_list_items(list_id,word_id) select l.id,e.id from scale_entry_ids e join scale_list_ids l on l.n=((e.n-1)/100)+1");
      await c.query("insert into private.collection_sharing_roots(owner_user_id,collection_id,is_open) select $1,id,true from scale_list_ids",[owner]);
      await c.query("insert into private.collection_sharing_subscriptions(user_id,root_id,access_lifetime) select $1,r.id,r.access_lifetime from private.collection_sharing_roots r where r.owner_user_id=$2",[viewer,owner]);
      for(const relation of ["word_entries","dictionaries","user_word_list_items","private.collection_sharing_roots","private.collection_sharing_subscriptions"]) await c.query(`analyze ${relation}`);
      const target=(await c.query("select id from scale_entry_ids where n=1")).rows[0].id;
      const body=(await c.query("select prosrc from pg_proc where oid='private.shared_author_entry_ids_v1(uuid,uuid[])'::regprocedure")).rows[0].prosrc as string;
      const sql=body.replace(/\bp_user_id\b/g,"$1").replace(/\bp_entry_ids\b/g,"$2");
      await c.query(`prepare scale_shared_point(uuid,uuid[]) as ${sql}`);
      const samples:unknown[]=[];
      for(const mode of ["force_custom_plan","force_generic_plan"]) {
        await c.query(`set local plan_cache_mode='${mode}'`);
        for(const [name,user,entry] of [["allowed",viewer,target],["outsider",outsider,target],["missing",viewer,randomUUID()]]) {
          const explanation=(await c.query("explain(analyze,buffers,format json) execute scale_shared_point('"+user+"',ARRAY['"+entry+"']::uuid[])" )).rows[0]["QUERY PLAN"][0];
          const nodes=flatten(explanation.Plan);
          const hot=nodes.filter(node=>["word_entries","user_word_list_items"].includes(String(node["Relation Name"])));
          const visited=hot.reduce((sum,node)=>sum+(Number(node["Actual Rows"]??0)+Number(node["Rows Removed by Filter"]??0))*Number(node["Actual Loops"]??0),0);
          expect(visited).toBeLessThan(20);
          expect((await c.query("select private.can_read_shared_author_entry_v1($1,$2) allowed",[user,entry])).rows[0].allowed).toBe(name==="allowed");
          const authority=(await c.query("explain(analyze,buffers,format json) select private.entry_access_v1($1,$2,'browse')",[user,entry])).rows[0]["QUERY PLAN"][0];
          samples.push({mode,case:name,visited,executionMs:explanation["Execution Time"],authorityExecutionMs:authority["Execution Time"],plan:explanation});
        }
      }
      await c.query("deallocate scale_shared_point");
      // Exercise complete material readers with real presentation identities.
      // The wide fixture above intentionally omitted those ingestion projections;
      // create the actual singleton identities for this1000-member material only.
      await c.query("insert into private.platform_v2_headword_groups(dictionary_id,management_kind,owner_user_id,singleton_entry_id) select $1,'user',$2,id from scale_entry_ids where n<=1000",[dictionary,owner]);
      const materialList=(await c.query("insert into user_word_lists(user_id,name) values($1,'large material') returning id",[owner])).rows[0].id;
      await c.query("insert into user_word_list_items(list_id,word_id) select $1,id from scale_entry_ids where n<=1000",[materialList]);
      const root=(await c.query("insert into private.collection_sharing_roots(owner_user_id,collection_id,is_open) values($1,$2,true) returning id,access_lifetime",[owner,materialList])).rows[0];
      await c.query("insert into private.collection_sharing_subscriptions(user_id,root_id,access_lifetime) values($1,$2,$3)",[viewer,root.id,root.access_lifetime]);
      const material={kind:"collection",collectionType:"user",id:materialList};
      const materialSamples:unknown[]=[];
      for(const principal of [owner,viewer]) for(const query of ["","scale-1"]) {
        const before=performance.now();
        const payload=(await c.query("select lookup_platform_v2_library_material_entries($1,$2,'nl',null,null,25,50,'{}',$3) payload",[principal,query,material])).rows[0].payload;
        const elapsedMs=performance.now()-before;
        expect(payload.error).toBeUndefined();
        expect(payload.items.length).toBe(query?1:25);
        expect(payload.page.totalGroups).toBe(query?1:1000);
        expect(payload.page.unavailableEntryCount).toBe(0);
        materialSamples.push({principal:principal===owner?"owner":"viewer",query,elapsedMs,items:payload.items.length,totalGroups:payload.page.totalGroups});
      }
      const materialBody=(await c.query("select prosrc from pg_proc where oid='private.readable_material_entry_ids_v1(uuid,jsonb)'::regprocedure")).rows[0].prosrc as string;
      const materialSql=materialBody.replace(/\bp_user_id\b/g,"$1").replace(/\bp_material\b/g,"$2");
      const materialPlan=(await c.query("explain(analyze,buffers,format json) "+materialSql,[viewer,material])).rows[0]["QUERY PLAN"][0];
      expect(materialPlan.Plan["Actual Rows"]).toBe(1000);
      expect(materialBody).not.toContain("entry_access_v1(");
      const catalogSamples:unknown[]=[];
      for(const principal of [owner,viewer])for(const sort of ['name','recent','count']){
        await c.query("select set_config('request.jwt.claim.sub',$1,true)",[principal]);
        const before=performance.now();
        const payload=(await c.query("select read_personal_collection_catalog_v1('',$1,'all',null,null,null,25) payload",[sort])).rows[0].payload;
        const elapsedMs=performance.now()-before;
        expect(payload.collections).toHaveLength(25);expect(payload.nextCursor).not.toBeNull();
        expect(new Set(payload.collections.map((row:{id:string})=>row.id)).size).toBe(25);
        expect(payload.collections.every((row:{ownership:string})=>row.ownership===(principal===owner?'owned':'received'))).toBe(true);
        catalogSamples.push({principal:principal===owner?'owner':'viewer',sort,elapsedMs,items:payload.collections.length});
      }
      if(process.env.SHARED_ACCESS_EVIDENCE_PATH) writeFileSync(process.env.SHARED_ACCESS_EVIDENCE_PATH,JSON.stringify({fixture:{entries:100000,collections:1000,materialMembers:1000},samples,materialSamples,materialPlan,catalogSamples},null,2));
    });
  },180000);
});
