import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {beforeAll,afterAll,describe,test,expect} from 'vitest';
import {getDbUrl,runMigrations,ensureUserWithSettings} from './dbTestUtils';
const url=getDbUrl();
(url?describe:describe.skip)('group authority admission',()=>{
 const pool=new Pool({connectionString:url});beforeAll(()=>runMigrations(pool));afterAll(()=>pool.end());
 test('close waits for shared author admission',async()=>{
  const owner=randomUUID(),label=randomUUID();const a=await pool.connect(),b=await pool.connect();
  try{
   await a.query('begin');await ensureUserWithSettings(a,owner);
   await a.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
   await a.query('insert into private.collection_labels(user_id,id,name) values($1,$2,$3)',[owner,label,'race']);
   await a.query("select mutate_label_share_v1($1,'open',0)",[label]);await a.query('commit');
   await a.query('begin');await a.query('select private.lock_sharing_author_scope_v1($1,false)',[owner]);
   await b.query('begin');await b.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
   const pid=(await b.query('select pg_backend_pid() pid')).rows[0].pid;
   const closing=b.query("select mutate_label_share_v1($1,'close',1) value",[label]);
   let waiting=false;
   for(let attempt=0;attempt<50;attempt++){
    const row=(await a.query('select wait_event_type from pg_stat_activity where pid=$1',[pid])).rows[0];
    if(row?.wait_event_type==='Lock'){waiting=true;break;}
    await new Promise(resolve=>setTimeout(resolve,10));
   }
   expect(waiting).toBe(true);await a.query('commit');
   expect((await closing).rows[0].value.isOpen).toBe(false);await b.query('commit');
  }finally{await a.query('rollback');await b.query('rollback');await a.query('delete from auth.users where id=$1',[owner]);a.release();b.release();}
 });
});
