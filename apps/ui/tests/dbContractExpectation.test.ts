import {expect,test} from "vitest";
import {resolveExpectedDbContract} from "@/lib/deployment/dbContract";

test("fresh baseline and upgraded installations identify the same latest schema",()=>{
 expect(resolveExpectedDbContract({contractId:"schema-287",baseline:{migrationId:287},migrations:[]})).toEqual({contractId:"schema-287",migrationId:287});
 expect(resolveExpectedDbContract({contractId:"schema-288",baseline:{migrationId:287},migrations:[{migrationId:288}]})).toEqual({contractId:"schema-288",migrationId:288});
});
test("an invalid baseline is not advertised as compatible",()=>{
 for(const migrationId of [0,-1,NaN,1.5])expect(()=>resolveExpectedDbContract({contractId:"invalid",baseline:{migrationId},migrations:[]})).toThrow("no expected migration");
});
