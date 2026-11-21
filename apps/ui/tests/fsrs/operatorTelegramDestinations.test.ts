import {afterAll, beforeAll, describe, expect, test} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Pool, type PoolClient} from 'pg';
import {ensureUserWithSettings, getDbUrl, runMigrations, withTransaction} from './dbTestUtils';

const dbUrl = getDbUrl();
const describeIfDb = dbUrl ? describe : describe.skip;

async function setup(client: PoolClient) {
  const operator = randomUUID(), bot = randomUUID(), version = 'a'.repeat(32);
  await ensureUserWithSettings(client, operator);
  await client.query("insert into public.admin_operators(email,user_id,is_active,permissions) values($1,$2,true,array['notifications.manage'])",
    [`${operator}@example.test`, operator]);
  await client.query("insert into private.operator_notification_bots(id,name,credential_state,secret_version) values($1,'synthetic','ready',$2)",
    [bot, version]);
  return {operator, bot, version};
}

describeIfDb('Telegram destinations and deployment notification routes', () => {
  const pool = new Pool({connectionString: dbUrl});
  beforeAll(() => runMigrations(pool), 120000);
  afterAll(() => pool.end());

  test('links an existing topic once, tracks its name and stops offering closed topics', async () => {
    await withTransaction(pool, async client => {
      const {operator, bot, version} = await setup(client);
      const hash = 'b'.repeat(64);
      await client.query('select public.admin_telegram_link_v1($1,$2,$3,$4)', [operator, randomUUID(), bot, hash]);
      const event = async (action: string, eventNumber: number, topic: number | null, name: string | null,
        credential = version, code: string | null = null) => (await client.query(
          'select public.operator_telegram_target_event_v1($1,$2,$3,$4,true,$5,$6,$7,$8,$9,$10) as accepted',
          [bot, credential, '-100123', 'Рабочий чат', topic, name, action, new Date(1700000000000 + 1000 * eventNumber), eventNumber, code],
        )).rows[0].accepted;
      const read = async () => (await client.query('select public.admin_telegram_targets_v1($1) as targets', [operator])).rows[0].targets;
      expect(await event('link', 1, 7, 'Деплой', 'c'.repeat(32), hash)).toBe(false);
      expect(await event('link', 1, 7, 'Деплой', version, hash)).toBe(true);
      expect(await event('link', 2, 8, 'Другой чат', version, hash)).toBe(false);
      expect(await event('renamed', 3, 7, 'Релизы')).toBe(true);
      expect(await read()).toEqual(expect.arrayContaining([
        expect.objectContaining({chatId:'-100123', topicId:null, title:'Рабочий чат', isForum:true}),
        expect.objectContaining({chatId:'-100123', topicId:7, title:'Релизы'}),
      ]));
      await event('closed', 4, 7, null);
      await event('renamed', 5, 7, 'Временно закрыта');
      await event('reopened', 2, 7, null);
      expect(await read()).toEqual([expect.objectContaining({topicId:null})]);
      await event('left', 6, null, null);
      expect(await read()).toEqual([]);
    });
  });

  test('deduplicates a workflow retry and pins the matching stage template for the same deployment route', async () => {
    await withTransaction(pool, async client => {
      const {operator, bot} = await setup(client);
      const values = {status:'Success', version:'0.19.1', commit:'a'.repeat(40), run_url:'https://example.test', candidate_url:'—'};
      const enqueue = (stage: string) => client.query('select public.operator_enqueue_deployment_v1($1,$2,$3) as status',
        [stage, '1042:1', JSON.stringify(values)]);
      expect((await enqueue('staging')).rows[0].status).toBe('no-route');
      const {rows:[{route}]} = await client.query("select public.admin_notification_save_route_v2($1,$2,null,0,$3,'deployment','-100123',7,true,'Team','Deployments') as route",
        [operator, randomUUID(), bot]);
      for (const stage of ['staging','production']) {
        await client.query('select public.admin_notification_publish_template_v1($1,$2,$3,$4,0)',
          [operator, randomUUID(), `deployment-${stage}`, `${stage} {{status}}`]);
        expect((await enqueue(stage)).rows[0].status).toBe('queued');
        expect((await enqueue(stage)).rows[0].status).toBe('queued');
      }
      const {rows} = await client.query("select item from public.operator_delivery_claim_v1(50) item where item->>'botId'=$1", [bot]);
      expect(rows.map(row => row.item)).toHaveLength(2);
      for (const stage of ['staging','production']) expect(rows.find(row => row.item.deploymentStage === stage)?.item).toMatchObject({
        kind:'deployment', topicId:7, chatId:'-100123', templateBody:`${stage} {{status}}`, deploymentValues:values,
      });
      expect(route.kind).toBe('deployment');
    });
  });
  test('archives a bot, disables its routes, and removes it from active settings', async () => {
    await withTransaction(pool, async client => {
      const {operator, bot} = await setup(client);
      await client.query("select public.admin_notification_save_route_v2($1,$2,null,0,$3,'feedback','-100123',7,true,'Team','Reports')",
        [operator, randomUUID(), bot]);
      const archive = (revision: number) => client.query('select public.admin_archive_notification_bot_v1($1,$2,$3,$4) as archived',
        [operator, randomUUID(), bot, revision]);
      expect((await archive(9)).rows[0].archived).toBe(false);
      expect((await archive(1)).rows[0].archived).toBe(true);
      expect((await archive(1)).rows[0].archived).toBe(false);
      const {rows:[{settings}]} = await client.query('select public.admin_notification_configuration_v3($1,$2) as settings',
        [operator, randomUUID()]);
      expect(settings.bots.some((item:{id:string}) => item.id === bot)).toBe(false);
      expect(settings.routes.some((item:{botId:string}) => item.botId === bot)).toBe(false);
      expect((await client.query('select enabled from private.operator_notification_routes where bot_id=$1',[bot])).rows)
        .toEqual([{enabled:false}]);
    });
  });

  test('disabling one route cancels its queued deliveries while another route can still send', async () => {
    await withTransaction(pool, async client => {
      const {bot} = await setup(client);
      const {rows} = await client.query(`insert into private.operator_notification_routes(bot_id,kind,chat_id,enabled)
        values($1,'deployment','-100123',true),($1,'deployment','-100124',true) returning id`,[bot]);
      const run = '7784:1';
      await client.query("select public.operator_enqueue_deployment_v1('staging',$1,'{}')",[run]);
      await client.query('update private.operator_notification_routes set enabled=false where id=$1',[rows[0].id]);
      await client.query('update private.operator_notification_routes set enabled=true where id=$1',[rows[0].id]);
      expect((await client.query('select state from private.operator_notification_deliveries where route_id=$1',[rows[0].id])).rows)
        .toEqual([{state:'cancelled'}]);
      const claimed = (await client.query('select public.operator_delivery_claim_v1(50) as item')).rows;
      expect(claimed.map(row=>row.item).filter(item=>item.botId===bot)).toEqual([
        expect.objectContaining({chatId:'-100124',kind:'deployment'}),
      ]);
    });
  });

});
