import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import test from "node:test";

const target = process.env.LOCAL_SUPABASE_DB_URL;
const migration = readFileSync(new URL("../migrations/179_pgcrypto_namespace_compatibility.sql", import.meta.url), "utf8");
const probe = readFileSync(new URL("../deploy-contract/pgcrypto-namespace-probe.sql", import.meta.url), "utf8");
function sql(url, input) {
  const result = spawnSync("psql", [url, "-X", "-v", "ON_ERROR_STOP=1", "-At"], {
    input, encoding: "utf8", timeout: 30000,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}
for (const namespace of ["public", "extensions"]) {
  test(`legacy RPC digest resolves with pgcrypto in ${namespace}`, { skip: !target }, () => {
    const url = new URL(target);
    assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
    const name = `pgcrypto_test_${randomUUID().replaceAll("-", "")}`;
    sql(target, `CREATE DATABASE ${name};`);
    url.pathname = `/${name}`;
    try {
      sql(url.href, `CREATE SCHEMA IF NOT EXISTS extensions;
        CREATE EXTENSION pgcrypto WITH SCHEMA ${namespace};
        CREATE FUNCTION public.legacy_digest() RETURNS bytea LANGUAGE plpgsql
        SET search_path = public, pg_temp AS $$ BEGIN RETURN digest('abc'::text, 'sha256'); END $$;`);
      if (namespace === "extensions") {
        const before = spawnSync("psql", [url.href, "-X", "-v", "ON_ERROR_STOP=1", "-c", "SELECT public.legacy_digest();"], { encoding: "utf8" });
        assert.notEqual(before.status, 0);
        assert.match(before.stderr, /function digest\(text, unknown\) does not exist/);
      }
      const body = sql(url.href, "SELECT prosrc FROM pg_proc WHERE oid='public.legacy_digest()'::regprocedure;");
      sql(url.href, migration);
      const oid = sql(url.href, "SELECT 'public.digest(text,text)'::regprocedure::oid;");
      sql(url.href, migration);
      assert.equal(sql(url.href, "SELECT 'public.digest(text,text)'::regprocedure::oid;"), oid);
      assert.equal(sql(url.href, "SELECT prosrc FROM pg_proc WHERE oid='public.legacy_digest()'::regprocedure;"), body);
      sql(url.href, probe);
      assert.match(sql(url.href, "SELECT encode(public.legacy_digest(), 'hex');"), /ba7816bf8f01cfea/);
    } finally {
      sql(target, `DROP DATABASE ${name} WITH (FORCE);`);
    }
  });
}
