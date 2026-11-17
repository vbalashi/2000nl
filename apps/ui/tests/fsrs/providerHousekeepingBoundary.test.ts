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
      union all select 'provider_work_maintain' where
        has_table_privilege('provider_housekeeping','private.provider_work','maintain')
      union all select 'admission_maintain' where
        has_table_privilege('provider_housekeeping','private.provider_admission_windows','maintain')
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
  let pool: Pool | undefined;
  let client: PoolClient | undefined;

  async function teardown(): Promise<unknown> {
    const activeClient = client;
    const activePool = pool;
    client = undefined;
    pool = undefined;
    let cleanupError: unknown;
    if (activeClient) {
      try {
        await activeClient.query("rollback");
      } catch (error) {
        cleanupError = error;
      }
      try {
        activeClient.release(cleanupError instanceof Error ? cleanupError : cleanupError ? true : undefined);
      } catch (error) {
        cleanupError ??= error;
      }
    }
    if (activePool) {
      try {
        await activePool.end();
      } catch (error) {
        cleanupError ??= error;
      }
    }
    return cleanupError;
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    await runMigrations(pool);
    client = await pool.connect();
    await client.query("begin");
    // Stock postgres:17 does not include Supabase's migration-owner role or
    // creator grant. This disposable fixture reproduces the exact catalog row
    // observed on a fresh Supabase stack; production SQL never writes catalogs.
    try {
      await client.query(`
      do $$ begin
        if not exists (select 1 from pg_roles where rolname='supabase_admin') then
          create role supabase_admin nologin createrole;
        end if;
      end $$;
      revoke provider_housekeeping from postgres;
      grant provider_housekeeping to postgres
        with admin true, inherit false, set false;
      update pg_auth_members
        set grantor=(select oid from pg_roles where rolname='supabase_admin')
        where roleid=(select oid from pg_roles where rolname='provider_housekeeping')
          and member=(select oid from pg_roles where rolname='postgres');
      `);
    } catch (error) {
      await teardown();
      throw error;
    }
  }, 120000);
  afterAll(async () => {
    const cleanupError = await teardown();
    if (cleanupError) throw cleanupError;
  });

  function fixtureClient() {
    if (!client) throw new Error("DB378 fixture client is not active");
    return client;
  }

  async function inSavepoint(name: string, action: (db: PoolClient) => Promise<void>) {
    const db = fixtureClient();
    await db.query(`savepoint ${name}`);
    try {
      await action(db);
    } finally {
      await db.query(`rollback to savepoint ${name}`);
      await db.query(`release savepoint ${name}`);
    }
  }

  test("qualified role has no direct storage, membership, or extra definer path", async () => {
    expect(await violations(fixtureClient())).toEqual([]);
  });

  test("allows the exact Supabase PostgreSQL 17 creator grant", async () => {
    const db = fixtureClient();
    const { rows } = await db.query(`
      select granted.rolname as granted, member.rolname as member, grantor.rolname as grantor,
        m.admin_option as admin, m.inherit_option as inherit, m.set_option as set
      from pg_auth_members m
      join pg_roles granted on granted.oid=m.roleid
      join pg_roles member on member.oid=m.member
      join pg_roles grantor on grantor.oid=m.grantor
      where granted.rolname='provider_housekeeping' or member.rolname='provider_housekeeping'
    `);
    expect(rows).toEqual([{ granted: "provider_housekeeping", member: "postgres", grantor: "supabase_admin", admin: true, inherit: false, set: false }]);
    expect(await violations(db)).toEqual([]);
    await expect(db.query(probeSql)).resolves.toBeDefined();
  });

  test("actual probe rejects an extra membership beside the allowed creator grant", async () => {
    await inSavepoint("extra_membership", async db => {
      await db.query("create role housekeeping_extra_fixture");
      await db.query("grant provider_housekeeping to housekeeping_extra_fixture");
      await expect(db.query(probeSql)).rejects.toThrow("provider housekeeping membership or SET ROLE path changed");
    });
  });

  for (const drift of [
    ["private schema usage", "grant usage on schema private to provider_housekeeping", "private_schema"],
    ["provider table read", "grant select on private.provider_work to provider_housekeeping", "provider_work_table"],
    ["admission column write", "grant update(requests) on private.provider_admission_windows to provider_housekeeping", "admission_table"],
    ["provider table direct maintain", "grant maintain on private.provider_work to provider_housekeeping", "provider_work_maintain"],
    ["admission table PUBLIC maintain", "grant maintain on private.provider_admission_windows to public", "admission_maintain"],
    ["unexpected membership", "create role housekeeping_fixture; grant provider_housekeeping to housekeeping_fixture", "membership"],
    ["extra security definer", "grant execute on function public.check_first_party_session_v1() to provider_housekeeping", "security_definer"],
    ["login capability", "alter role provider_housekeeping login", "role_attributes"],
  ] as const) {
    test(`detects negative drift: ${drift[0]}`, async () => {
      await inSavepoint(`drift_${drift[2]}`, async db => {
        await db.query(drift[1]);
        expect(await violations(db)).toContain(drift[2]);
        await expect(db.query(probeSql)).rejects.toThrow("db-contract-gate:");
      });
    });
  }

  for (const [name, mutation] of [
    ["SET TRUE", "update pg_auth_members set set_option=true where roleid=(select oid from pg_roles where rolname='provider_housekeeping') and member=(select oid from pg_roles where rolname='postgres')"],
    ["INHERIT TRUE", "update pg_auth_members set inherit_option=true where roleid=(select oid from pg_roles where rolname='provider_housekeeping') and member=(select oid from pg_roles where rolname='postgres')"],
    ["ADMIN FALSE", "update pg_auth_members set admin_option=false where roleid=(select oid from pg_roles where rolname='provider_housekeeping') and member=(select oid from pg_roles where rolname='postgres')"],
    ["wrong grantor", "update pg_auth_members set grantor=(select oid from pg_roles where rolname='postgres') where roleid=(select oid from pg_roles where rolname='provider_housekeeping') and member=(select oid from pg_roles where rolname='postgres')"],
  ] as const) {
    test(`rejects creator membership drift: ${name}`, async () => {
      await inSavepoint(`creator_${name.toLowerCase().replace(/[^a-z]+/g, "_")}`, async db => {
        await db.query(mutation);
        expect(await violations(db)).toContain("membership");
        await expect(db.query(probeSql)).rejects.toThrow("provider housekeeping membership or SET ROLE path changed");
      });
    });
  }
});
