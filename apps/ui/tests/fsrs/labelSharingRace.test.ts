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
 test('source contention fails safely and an accepted audience still requires confirmation on retry',async()=>{
  const owner=randomUUID(),viewer=randomUUID(),label=randomUUID(),list=randomUUID();
  const a=await pool.connect(),b=await pool.connect(),c=await pool.connect();let entry:string|undefined;
  try {
   await a.query('begin');await ensureUserWithSettings(a,owner);await ensureUserWithSettings(a,viewer);
   await a.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
   entry=(await a.query('select create_user_dictionary_entry($1,null,$2) id',[owner,{headword:randomUUID(),languageCode:'nl',definition:'race'}])).rows[0].id;
   await a.query("insert into user_word_lists(id,user_id,name) values($1,$2,'race')",[list,owner]);
   await a.query("insert into private.collection_labels(id,user_id,name) values($1,$2,'race')",[label,owner]);
   await a.query('insert into private.collection_label_assignments values($1,$2,$3)',[owner,list,label]);
   const opened=(await a.query("select mutate_label_share_v1($1,'open',0) value",[label])).rows[0].value;
   await a.query('commit');await a.query('begin');await a.query('select id from word_entries where id=$1 for update',[entry]);
   await b.query('begin');await b.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);await b.query('set local role authenticated');
   await expect(b.query('select add_entry_to_user_list($1,$2,$3)',[owner,list,entry])).rejects.toThrow('collection_audience_changed');
   await b.query('rollback');
   await c.query('begin');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[viewer]);await c.query('set local role authenticated');
   await c.query('select accept_label_share_v1($1)',[opened.invitationCode]);await c.query('commit');
   await a.query('commit');
   await b.query('begin');await b.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);await b.query('set local role authenticated');
   await expect(b.query('select add_entry_to_user_list($1,$2,$3)',[owner,list,entry])).rejects.toThrow('collection_audience_confirmation_required');
   await b.query('rollback');
   expect((await a.query('select count(*)::int n from user_word_list_items where list_id=$1',[list])).rows[0].n).toBe(0);
   const audience=(await a.query('select private.collection_audience_recipients_v1($1,$2) value',[owner,list])).rows[0].value;
   expect(audience.map((row:{userId:string})=>row.userId)).toEqual([viewer]);
  } finally {
   await a.query('rollback');await b.query('rollback');await c.query('rollback');
   try {if(entry)await a.query('delete from word_entries where id=$1',[entry]);await a.query('delete from auth.users where id=any($1::uuid[])',[[owner,viewer]]);}
   finally{a.release();b.release();c.release();}
  }
 });

});
