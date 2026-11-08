import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { ensureUserWithSettings, getDbUrl, insertWord, runMigrations, withTransaction } from './dbTestUtils';

const dbUrl = getDbUrl();
const describeIfDb = dbUrl ? describe : describe.skip;

describeIfDb('owned collections in a label subtree', () => {
  const pool = new Pool({ connectionString: dbUrl });
  beforeAll(async () => { await runMigrations(pool); });
  afterAll(async () => { await pool.end(); });

  test('includes current descendants once, follows moves and excludes foreign placements', async () => {
    await withTransaction(pool, async client => {
      const owner = randomUUID(), other = randomUUID();
      const root = randomUUID(), child = randomUUID(), outside = randomUUID();
      const own = randomUUID(), future = randomUUID(), foreign = randomUUID();
      await ensureUserWithSettings(client, owner);
      await ensureUserWithSettings(client, other);
      await client.query(`insert into private.collection_labels (user_id,id,parent_id,name) values
        ($1,$2,null,'root'),($1,$3,$2,'child'),($1,$4,null,'outside')`, [owner, root, child, outside]);
      await client.query(`insert into public.user_word_lists (id,user_id,name) values
        ($1,$4,'own'),($2,$4,'future'),($3,$5,'foreign')`, [own, future, foreign, owner, other]);
      await client.query(`insert into private.collection_label_assignments (user_id,collection_id,label_id) values
        ($1,$2,$3),($1,$2,$4)`, [owner, own, root, child]);
      await client.query(`insert into private.received_collection_label_placements (user_id,collection_id,label_id)
        values ($1,$2,$3)`, [owner, foreign, child]);
      const ids = async (label: string) => (await client.query(
        'select collection_id from private.label_subtree_owned_collections_v1($1,$2) order by collection_id',
        [owner, label],
      )).rows.map(row => row.collection_id as string);
      expect(await ids(root)).toEqual([own]);
      await client.query('insert into private.collection_label_assignments values ($1,$2,$3)', [owner, future, child]);
      expect(await ids(root)).toEqual([own, future].sort());
      await client.query('update private.collection_labels set parent_id=$1 where id=$2', [outside, child]);
      expect(await ids(root)).toEqual([own]);
      expect(await ids(outside)).toEqual([own, future].sort());
      expect(await ids(randomUUID())).toEqual([]);
      expect((await client.query(`select has_function_privilege('authenticated',
        'private.label_subtree_owned_collections_v1(uuid,uuid)','execute') as allowed`)).rows[0].allowed).toBe(false);
    });
  });

  test('identifies borrowed private entries without including own or common entries', async () => {
    await withTransaction(pool, async client => {
      const owner = randomUUID(), author = randomUUID();
      const label = randomUUID(), collection = randomUUID();
      await ensureUserWithSettings(client, owner);
      await ensureUserWithSettings(client, author);
      const createEntry = async (user: string, headword: string) => {
        await client.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
        return (await client.query('select create_user_dictionary_entry($1,null,$2) id',
          [user, { headword, languageCode: 'nl', definition: 'definition' }])).rows[0].id as string;
      };
      const own = await createEntry(owner, 'own');
      const borrowed = await createEntry(author, 'borrowed');
      const common = await insertWord(client, 'common');
      await client.query('insert into private.collection_labels(user_id,id,name) values ($1,$2,$3)', [owner,label,'root']);
      await client.query('insert into user_word_lists(id,user_id,name) values ($1,$2,$3)', [collection,owner,'collection']);
      await client.query('insert into private.collection_label_assignments values ($1,$2,$3)', [owner,collection,label]);
      await client.query('insert into user_word_list_items(list_id,word_id) select $1, unnest($2::uuid[])',
        [collection,[own,borrowed,common]]);
      expect((await client.query('select * from private.label_subtree_borrowed_entries_v1($1,$2)', [owner,label])).rows)
        .toEqual([{collection_id:collection, entry_id:borrowed}]);
      await client.query("select set_config('request.jwt.claim.sub',$1,true)",[owner]);
      await client.query('set local role authenticated');
      expect((await client.query('select preflight_label_share_v1($1) value',[label])).rows[0].value)
        .toEqual({labelId:label,collections:[{collectionId:collection,name:'collection',borrowedCount:1}]});
      await client.query('savepoint borrowed_open');
      await expect(client.query("select mutate_label_share_v1($1,'open',0)",[label])).rejects.toThrow('share_copy_required');
      await client.query('rollback to savepoint borrowed_open');
      await client.query('reset role');

      expect((await client.query(`select has_function_privilege('authenticated',
        'private.label_subtree_borrowed_entries_v1(uuid,uuid)','execute') as allowed`)).rows[0].allowed).toBe(false);
    });
  });
});
