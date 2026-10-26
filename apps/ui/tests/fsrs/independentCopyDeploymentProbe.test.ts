import fs from "node:fs";
import path from "node:path";
import {Pool} from "pg";
import {beforeAll,afterAll,describe,test} from "vitest";
import {getDbUrl,runMigrations} from "./dbTestUtils";
const url=getDbUrl(),root=path.resolve(process.cwd(),"../..");
function expand(file:string):string{
 return fs.readFileSync(path.join(root,file),"utf8").replace(/^\\i (.+)$/gm,(_,child:string)=>expand(child.trim()));
}
(url?describe:describe.skip)("independent copy installed contract",()=>{
 const pool=new Pool({connectionString:url});beforeAll(()=>runMigrations(pool));afterAll(()=>pool.end());
 test("retains the previous release's checks and passes both full postflight chains",async()=>{
  await pool.query(expand("db/deploy-contract/postflight-242.sql"));
  await pool.query(expand("db/deploy-contract/read-only-postflight-242.sql"));
 });
});
