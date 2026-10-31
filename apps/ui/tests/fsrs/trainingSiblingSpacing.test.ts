import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { ensureUserWithSettings, getDbUrl, insertWord, runMigrations, withTransaction } from './dbTestUtils';
const dbUrl = getDbUrl();
const direct = 'word-to-definition', reverse = 'definition-to-word';
const modes = [direct, reverse];
(dbUrl ? describe : describe.skip)('meaning sibling spacing', () => {
  const pool = new Pool({ connectionString: dbUrl });
  beforeAll(() => runMigrations(pool));
  afterAll(() => pool.end());
  async function order(c: PoolClient, labels: string[], total = labels.length, recent: string[] = [], sources?: string[]) {
    const ids = new Map<string,string>();
    for (const label of [...labels,...recent]) if (!ids.has(label)) ids.set(label,randomUUID());
    const seen = new Set<string>();
    const candidates = labels.map((label,i) => {
      const row = { entry_id: ids.get(label), card_type_id: seen.has(label) ? reverse : direct, queue_source: sources?.[i] ?? 'review' };
      seen.add(label); return row;
    });
    const rows = (await c.query('select * from private.space_meaning_training_candidates_v1($1::jsonb,$2,2,$3::uuid[])', [JSON.stringify(candidates),total,recent.map(label => ids.get(label))])).rows;
    return { rows, labels: rows.map(row => [...ids].find(([,id]) => id === row.entry_id)![0]) };
  }
  test('moves adjacent and near siblings behind three other cards', () => withTransaction(pool, async c => {
    const result = await order(c,['A','B','B','C','D','D','E','F','G','H']);
    expect(result.labels).toEqual(['A','B','C','D','E','B','F','D','G','H']);
    expect(new Set(result.rows.map(r => `${r.entry_id}:${r.card_type_id}`)).size).toBe(10);
    expect(result.rows.map(r => r.session_ordinal)).toEqual([1,2,3,4,5,6,7,8,9,10]);
    expect((await order(c,['A','B','A','C','D'])).labels).toEqual(['A','B','C','D','A']);
    expect((await order(c,['A','B','C','D','A'])).labels).toEqual(['A','B','C','D','A']);
  }));
  test('looks past the session boundary without increasing its size', () => withTransaction(pool, async c => {
    expect((await order(c,['A','B','C','D','E','F','G','H','I','I','J'],10)).labels).toEqual(['A','B','C','D','E','F','G','H','I','J']);
  }));
  test('relaxes only if necessary and prefers the least recent meaning', () => withTransaction(pool, async c => {
    expect((await order(c,['A','A'])).labels).toEqual(['A','A']);
    expect((await order(c,['A','B','B','A'])).labels).toEqual(['A','B','A','B']);
    expect((await order(c,[])).rows).toEqual([]);
  }));
  test('uses the consumed prefix when rebuilding a remainder', () => withTransaction(pool, async c => {
    expect((await order(c,['A','B','C','D'],4,['X','Y','A'])).labels).toEqual(['B','C','D','A']);
  }));
  test('keeps the new/review rhythm unless spacing needs another category', () => withTransaction(pool, async c => {
    const result = await order(c,['A','B','C','D','E','F'],6,[],['new','new','review','review','review','review']);
    expect(result.rows.map(r => r.queue_source)).toEqual(['new','review','review','new','review','review']);
    expect((await order(c,['A','A','B','C','D'],5,[],['new','review','new','new','new'])).labels).toEqual(['A','B','C','D','A']);
  }));
  test('real start and resume replace the tenth sibling without changing its state', () => withTransaction(pool, async c => {
    const user = randomUUID();
    await ensureUserWithSettings(c,user);
    await c.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','service_role',true),set_config('training.test_reference_now',statement_timestamp()::text,true)",[user]);
    const entries = new Map<string,string>(), seen = new Set<string>();
    let index = 0;
    for (const label of ['A','B','C','D','E','F','G','H','I','I','J']) {
      if (!entries.has(label)) entries.set(label,await insertWord(c,`spacing-${user}-${label}`));
      await c.query(`insert into user_card_status(user_id,entry_id,card_type_id,fsrs_enabled,fsrs_reps,fsrs_stability,fsrs_difficulty,fsrs_last_interval,last_reviewed_at,next_review_at)
        values($1,$2,$3,true,2,5,5,1,now()-interval '3 days',now()-interval '2 days'+$4*interval '1 second')`,[user,entries.get(label),seen.has(label)?reverse:direct,index++]);
      seen.add(label);
    }
    const states = () => c.query('select * from user_card_status where user_id=$1 order by entry_id,card_type_id',[user]);
    const before = (await states()).rows;
    const session = (await c.query("select start_training_session($1,$2::text[],null,'curated','review','{}','10',$3::uuid,2) s",[user,modes,randomUUID()])).rows[0].s;
    const readMembers = () => c.query('select entry_id,card_type_id,ordinal from training_session_members where session_id=$1 order by ordinal',[session.sessionId]);
    const members = (await readMembers()).rows;
    expect(members).toHaveLength(10);
    expect(members[8].entry_id).toBe(entries.get('I'));
    expect(members[9].entry_id).toBe(entries.get('J'));
    await c.query('select get_training_session_snapshot($1,$2)',[user,session.sessionId]);
    expect((await readMembers()).rows).toEqual(members);
    expect((await states()).rows).toEqual(before);
    const pending = (await c.query("select * from private.training_session_members_v1($1,$2::text[],null,'curated','review','{}','all-due-today',2,$3::text[])",[user,modes,members.map(m => `${m.entry_id}:${m.card_type_id}`)])).rows;
    expect(pending.map(r => [r.entry_id,r.card_type_id])).toEqual([[entries.get('I'),reverse]]);
  }));
  test('external replan preserves spacing across the consumed boundary', () => withTransaction(pool, async c => {
    const user = randomUUID();
    await ensureUserWithSettings(c,user);
    await c.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','service_role',true),set_config('training.test_reference_now',statement_timestamp()::text,true)",[user]);
    const ids: string[] = [];
    for (let i=0;i<8;i++) {
      const id = await insertWord(c,`replan-spacing-${user}-${i}`);
      ids.push(id);
      await c.query(`insert into user_card_status(user_id,entry_id,card_type_id,fsrs_enabled,fsrs_reps,fsrs_stability,fsrs_difficulty,fsrs_last_interval,last_reviewed_at,next_review_at)
        values($1,$2,$3,true,2,5,5,1,now()-interval '3 days',now()-interval '2 days'+$4*interval '1 second')`,[user,id,direct,i+2]);
    }
    await c.query(`insert into user_card_status(user_id,entry_id,card_type_id,fsrs_enabled,fsrs_reps,fsrs_stability,fsrs_difficulty,fsrs_last_interval,last_reviewed_at,next_review_at)
      values($1,$2,$3,true,2,5,5,1,now()-interval '3 days',now()-interval '2 days'+interval '3 seconds')`,[user,ids[0],reverse]);
    const session = (await c.query("select start_training_session($1,$2::text[],null,'curated','review','{}','10',$3::uuid,2) s",[user,modes,randomUUID()])).rows[0].s;
    async function grade(entry: string, sessionId: string | null) {
      const state = (await c.query('select private.platform_v2_card_state_json($1,$2,$3) s',[user,entry,direct])).rows[0].s;
      const result = (await c.query("select perform_platform_v2_card_action_as_principal($1,'review-card',$2,$3,$4,null,null,'success',$5::uuid,null,'first_party',null,$6::uuid) r",[user,entry,direct,state.stateRevision,randomUUID(),sessionId])).rows[0].r;
      expect(result.status).toBe('accepted');
    }
    await grade(ids[0],session.sessionId);
    await grade(ids[7],null);
    const read = () => c.query('select get_training_session_snapshot($1,$2) s',[user,session.sessionId]);
    const snapshot = (await read()).rows[0].s;
    expect(snapshot.planRevision).toBeGreaterThan(0);
    const remaining = snapshot.members.filter((m: {consumedAt: string | null; unavailableAt: string | null}) => !m.consumedAt && !m.unavailableAt);
    const siblingIndex = remaining.findIndex((m: {entryId: string; cardTypeId: string}) => m.entryId === ids[0] && m.cardTypeId === reverse);
    expect(siblingIndex).toBeGreaterThanOrEqual(3);
    expect(remaining).toHaveLength(7);
    expect((await read()).rows[0].s.members).toEqual(snapshot.members);
  }));

});
