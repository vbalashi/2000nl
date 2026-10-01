import {test} from "node:test";
import assert from "node:assert/strict";
import {unoptimizedAuthUidLines as check} from "./check-auth-uid-patterns.mjs";
test("accepts case-insensitive scalar select and once-per-call UUID initializers",()=>{
 assert.deepEqual(check("USING (owner = (SELECT auth.uid()));\nDECLARE v_user uuid := auth.uid();\n  v_user_id uuid := auth.uid();\n-- auth.uid()"),[]);
});
test("rejects bare policy calls including mixed wrapped and unwrapped calls",()=>{
 assert.deepEqual(check("USING (owner = auth.uid());\nUSING (owner = (select auth.uid()) OR other = auth.uid());"),[1,2]);
});
