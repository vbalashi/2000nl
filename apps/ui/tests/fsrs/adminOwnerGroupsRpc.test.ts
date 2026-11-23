import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureUserWithSettings, getDbUrl, runMigrations, withTransaction } from "./dbTestUtils";

const url = getDbUrl();

describe.skipIf(!url)("Owner access groups", () => {
  const pool = new Pool({ connectionString: url });
  beforeAll(async () => { await runMigrations(pool); });
  afterAll(async () => { await pool.end(); });

  it("manages all assigned groups while preserving audit and delegated tester access", async () => {
    await withTransaction(pool, async client => {
      const ids = { owner: randomUUID(), operator: randomUUID(), user: randomUUID(), group: randomUUID() };
      for (const id of [ids.owner, ids.operator, ids.user]) await ensureUserWithSettings(client, id);
      await client.query(
        `insert into public.admin_operators(email,user_id,is_active,permissions) values
          ($1,$2,true,private.admin_owner_permissions_v1()),
          ($3,$4,true,ARRAY['users.read','testers.manage'])`,
        [`owner-${ids.owner}@example.test`, ids.owner, `operator-${ids.operator}@example.test`, ids.operator],
      );
      await client.query(
        "insert into public.dictionary_access_groups(id,key,name) values ($1,$2,'Reviewers')",
        [ids.group, `reviews-${ids.group}`],
      );
      const call = async (actor: string, group: string | null, member: boolean | null, user = ids.user) => (
        await client.query(
          "select public.admin_owner_user_access_v1($1,$2,$3,$4,$5) as result",
          [actor, user, randomUUID(), group, member],
        )
      ).rows[0].result;

      expect(await call(ids.operator, ids.group, true)).toEqual({ error: "forbidden" });
      expect(await call(ids.owner, ids.group, true, randomUUID())).toEqual({ error: "not_found" });
      expect(await call(ids.owner, randomUUID(), true)).toEqual({ error: "group_unavailable" });
      expect(await call(ids.owner, null, true)).toEqual({ error: "invalid_request" });
      for (const member of [false, true, true, false, false]) {
        const result = await call(ids.owner, ids.group, member);
        expect(result.groups).toEqual(expect.arrayContaining([{ id: ids.group, name: "Reviewers", description: null, member }]));
      }

      const counts = await client.query(
        `select action,count(*)::int as count from public.admin_audit_events
          where target_type='user_group_membership' and target_id=$1 group by action order by action`,
        [`${ids.user}/${ids.group}`],
      );
      expect(counts.rows).toEqual([{ action: "user.group.added", count: 1 }, { action: "user.group.removed", count: 1 }]);

      const details = async (actor: string) => (await client.query(
        "select public.admin_user_access_details_v1($1,$2,$3) as result", [actor, ids.user, randomUUID()],
      )).rows[0].result;
      expect((await details(ids.operator)).history).toBeNull();
      const history = (await details(ids.owner)).history;
      expect(history).toEqual(expect.arrayContaining([
        expect.objectContaining({ action: "user.group.added", groupName: "Reviewers", operatorId: ids.owner }),
        expect.objectContaining({ action: "user.group.removed", groupName: "Reviewers", operatorId: ids.owner }),
      ]));

      const { rows: [grants] } = await client.query(`
        select has_function_privilege('service_role', routine, 'EXECUTE') as service,
          has_function_privilege('authenticated', routine, 'EXECUTE') as learner
        from (values ('public.admin_owner_user_access_v1(uuid,uuid,uuid,text,boolean)'::regprocedure)) f(routine)`);
      expect(grants).toEqual({ service: true, learner: false });
    });
  });
});
