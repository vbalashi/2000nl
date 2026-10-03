/** Read-only query-body comparison on a disposable, populated local FSRS database. */
import { Pool } from 'pg';
import { isDeepStrictEqual } from 'node:util';
async function main(){
const url=new URL(process.env.FSRS_TEST_DB_URL ?? '');
if(!['localhost','127.0.0.1'].includes(url.hostname)||!/^\/2000nl_fsrs_[a-z0-9_]+$/.test(url.pathname)||url.search)throw new Error('disposable_local_database_required');
const pool=new Pool({connectionString:url.toString()});
const client=await pool.connect();
try{
 await client.query('BEGIN READ ONLY');
 await client.query("SET LOCAL statement_timeout='10s'");
 const names=['lookup_platform_v2_library_filtered_entries_base_v1','lookup_platform_v2_library_browse_entries_v1'];
 const queries:string[]=[];
 for(const name of names){
  const {rows}=await client.query('select pg_get_functiondef($1::regprocedure) definition',[`private.${name}(uuid,boolean,text,text,text,integer,integer,jsonb)`]);
  const definition=String(rows[0].definition);
  let query=definition.slice(definition.indexOf('    WITH user_context'),definition.indexOf('    INTO\n        v_items'));
  const literals:Record<string,string>={p_user_id:'$1::uuid',p_catalog:'false',p_library_selection:'$2::jsonb',v_language_code:"'nl'::text",v_raw_query:'NULL::text',v_query:"''::text",v_query_unaccent:"''::text",v_cursor_group_id:'NULL::uuid',v_cursor_tier_rank:'NULL::integer',v_cursor_match_rank:'NULL::integer',v_cursor_dictionary_rank:'NULL::integer',v_cursor_sort_headword:'NULL::text',v_group_limit:'25',v_group_entry_bound:'50',v_query_key:"'benchmark'::text"};
  for(const [name,literal] of Object.entries(literals))query=query.replace(new RegExp('\\b'+name+'\\b','g'),()=>literal);
  queries.push(query);
 }
 const owner='00000000-0000-0000-0000-000000000544';
 const evidence=[];
 for(const filters of [{parts:[],article:null},{parts:['noun'],article:'de'},{parts:['verb'],article:null}]){
  const scope={materialSelection:{schemaVersion:1,allowedLanguageCodes:null,disabledDictionaryIds:[]},dictionaryIds:null,...filters};
  const values=[owner,JSON.stringify(scope)];
  const before=await client.query({text:queries[0],values,rowMode:'array'});
  const after=await client.query({text:queries[1],values,rowMode:'array'});
  if(!isDeepStrictEqual(before.rows,after.rows))throw new Error('browse_projection_mismatch');
  if(filters.parts.length===0 && before.rows[0][5]<10_000)throw new Error('production_shaped_fixture_required');
  const runs=[];
  for(let round=0;round<3;round++)for(let version=0;version<2;version++){
   const {rows}=await client.query('EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) '+queries[version],values);
   const plan=rows[0]['QUERY PLAN'][0];
   runs.push({version:version?'optimized':'baseline',round,executionMs:plan['Execution Time'],sharedHits:plan.Plan['Shared Hit Blocks'],sharedReads:plan.Plan['Shared Read Blocks']});
  }
  if(filters.parts.length===0 && runs.some(run=>run.version==='optimized' && run.sharedHits+run.sharedReads>=10_000))throw new Error('browse_buffer_budget_exceeded');
  evidence.push({filters,parity:true,totalGroups:before.rows[0][5],runs});
 }
 const rpcRuns=[];
 for(const mode of ['force_custom_plan','force_generic_plan']){
  await client.query(`SET LOCAL plan_cache_mode=${mode}`);
  const rpc=`SELECT public.lookup_platform_v2_library_filtered_entries($1,'','nl',NULL,NULL,25,50,'{}')`;
  const actual=await client.query(rpc,[owner]);
  if(actual.rows[0].lookup_platform_v2_library_filtered_entries.error)throw new Error('rpc_projection_failed');
  for(let round=0;round<7;round++){
   const {rows}=await client.query('EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) '+rpc,[owner]);
   const plan=rows[0]['QUERY PLAN'][0];
   rpcRuns.push({mode,round,executionMs:plan['Execution Time'],sharedHits:plan.Plan['Shared Hit Blocks'],sharedReads:plan.Plan['Shared Read Blocks']});
  }
 }
 console.log(JSON.stringify({fixture:'local-public-dictionary-copy; no user learning state',evidence,rpcRuns},null,2));
}finally{await client.query('ROLLBACK');client.release();await pool.end();}

}
void main().catch(error=>{console.error(error);process.exitCode=1;});
