import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Pool, PoolClient } from "pg";
import { getDbUrl, runMigrations } from "./dbTestUtils";

const url = getDbUrl();

async function violations(client: Pool | PoolClient) {
  const { rows } = await client.query(`
    with role_identity as (
      select oid from pg_roles where rolname='provider_housekeeping'
    ), violations(kind) as (
      select 'role_attributes' where exists (
        select 1 from pg_roles where rolname='provider_housekeeping'
          and (rolcanlogin or rolsuper or rolcreatedb or rolcreaterole or rolinherit or rolreplication or rolbypassrls)
      )
      union all select 'membership' where exists (
        select 1 from pg_auth_members m, role_identity r where m.roleid=r.oid or m.member=r.oid
      )
      union all select 'private_schema' where has_schema_privilege('provider_housekeeping','private','usage')
      union all select 'provider_work_table' where
        has_table_privilege('provider_housekeeping','private.provider_work','select,insert,update,delete,truncate,references,trigger')
        or has_any_column_privilege('provider_housekeeping','private.provider_work','select,insert,update,references')
      union all select 'admission_table' where
        has_table_privilege('provider_housekeeping','private.provider_admission_windows','select,insert,update,delete,truncate,references,trigger')
        or has_any_column_privilege('provider_housekeeping','private.provider_admission_windows','select,insert,update,references')
      union all select 'security_definer' where exists (
        select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where p.prosecdef and has_schema_privilege('provider_housekeeping',n.oid,'usage')
          and has_function_privilege('provider_housekeeping',p.oid,'execute')
          and p.oid not in (
            'provider_housekeeping.run_provider_housekeeping_v1(text)'::regprocedure,
            'provider_housekeeping.inspect_provider_housekeeping_v1(text)'::regprocedure
          )
      )
    ) select kind from violations order by kind
  `);
  return rows.map(row => row.kind as string);
}

describe.skipIf(!url)("provider housekeeping effective privilege boundary", () => {
  let pool: Pool;
  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    await runMigrations(pool);
  }, 120000);
  afterAll(async () => { await pool?.end(); });

  test("qualified role has no direct storage, membership, or extra definer path", async () => {
    expect(await violations(pool)).toEqual([]);
  });

  for (const drift of [
    ["private schema usage", "grant usage on schema private to provider_housekeeping", "private_schema"],
    ["provider table read", "grant select on private.provider_work to provider_housekeeping", "provider_work_table"],
    ["admission column write", "grant update(requests) on private.provider_admission_windows to provider_housekeeping", "admission_table"],
    ["unexpected membership", "create role housekeeping_fixture; grant provider_housekeeping to housekeeping_fixture", "membership"],
    ["extra security definer", "grant execute on function public.check_first_party_session_v1() to provider_housekeeping", "security_definer"],
    ["login capability", "alter role provider_housekeeping login", "role_attributes"],
  ] as const) {
    test(`detects negative drift: ${drift[0]}`, async () => {
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query(drift[1]);
        expect(await violations(client)).toContain(drift[2]);
      } finally {
        await client.query("rollback");
        client.release();
      }
    });
  }
});
