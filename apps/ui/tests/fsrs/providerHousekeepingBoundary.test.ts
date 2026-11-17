import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Pool, PoolClient } from "pg";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getDbUrl, runMigrations } from "./dbTestUtils";

const url = getDbUrl();
const probeSql = readFileSync(resolve(process.cwd(), "../../db/deploy-contract/provider-housekeeping-probe.sql"), "utf8");

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
        select 1
        from pg_auth_members m
        join pg_roles granted on granted.oid=m.roleid
        join pg_roles member on member.oid=m.member
        join pg_roles grantor on grantor.oid=m.grantor
        cross join role_identity r
        where (m.roleid=r.oid or m.member=r.oid)
          and not (
            granted.rolname='provider_housekeeping'
            and member.rolname='postgres'
            and member.rolcreaterole
            and grantor.rolname='supabase_admin'
            and m.admin_option
            and not m.inherit_option
            and not m.set_option
          )
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

  test("allows the exact Supabase PostgreSQL 17 creator grant", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("grant provider_housekeeping to postgres with admin true, inherit false, set false granted by supabase_admin");
      expect(await violations(client)).toEqual([]);
      await expect(client.query(probeSql)).resolves.toBeDefined();
      await client.query("rollback");
    } finally {
      client.release();
    }
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
        await expect(client.query(probeSql)).rejects.toThrow("db-contract-gate:");
      } finally {
        await client.query("rollback");
        client.release();
      }
    });
  }

  for (const [name, grant] of [
    ["SET TRUE", "grant provider_housekeeping to postgres with admin true, inherit false, set true granted by supabase_admin"],
    ["INHERIT TRUE", "grant provider_housekeeping to postgres with admin true, inherit true, set false granted by supabase_admin"],
    ["ADMIN FALSE", "grant provider_housekeeping to postgres with admin false, inherit false, set false granted by supabase_admin"],
    ["wrong grantor", "grant provider_housekeeping to postgres with admin true, inherit false, set false granted by postgres"],
  ] as const) {
    test(`rejects creator membership drift: ${name}`, async () => {
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query("revoke provider_housekeeping from postgres");
        await client.query(grant);
        expect(await violations(client)).toContain("membership");
        await expect(client.query(probeSql)).rejects.toThrow("provider housekeeping membership or SET ROLE path changed");
        await client.query("rollback");
      } finally {
        client.release();
      }
    });
  }
});
