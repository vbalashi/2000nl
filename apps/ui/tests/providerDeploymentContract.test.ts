import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { expect, test } from "vitest";
import contract from "../../../packages/shared/deployment/db-contract.json";
const root=path.resolve(process.cwd(),"../..");
const read=(file:string)=>fs.readFileSync(path.join(root,file),"utf8");
const digest=(text:string)=>crypto.createHash("sha256").update(text).digest("hex");
function expand(file:string):string{return read(file).replace(/^\\i (.+)$/gm,(_line,child:string)=>expand(child.trim()));}
test("manifest migrations and hashes are reachable through the real fresh-install entrypoint",()=>{
 const bootstrap=read("db/migrations/bootstrap.sql");
 for(const migration of [contract.baseline,...contract.migrations]){
   expect(bootstrap).toContain(`\\i ${migration.file}`);expect(digest(read(migration.file))).toBe(migration.sha256);
 }
 expect(contract.migrations.some(m=>m.file==="db/migrations/374_provider_work_safety.sql")).toBe(true);
});
test("provider safety is in normal and read-only deployment chains, with the correct manifest hash",()=>{
 expect(digest(read(contract.readOnlyPostflightProbe.file))).toBe(contract.readOnlyPostflightProbe.sha256);
 for(const probe of [contract.postflightProbe,contract.readOnlyPostflightProbe.file]){
   const expanded=expand(probe);expect(expanded).toContain("provider_work_rpc_contract_failed");expect(expanded).toContain("provider_work_storage_contract_failed");
 }
});
