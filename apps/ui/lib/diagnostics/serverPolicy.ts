import { readFileSync, statSync } from "node:fs";
import { disabledDiagnosticPolicy, type DiagnosticPolicy } from "./policy";
let cachedPath: string | undefined, cachedRaw: string | undefined, checkedAt=0;
/** Operator-owned mounted file. Refresh within five seconds so atomic replacement takes
 * effect across processes without a build, restart or database migration. */
export function diagnosticPolicyFor(userId?: string): DiagnosticPolicy {
  try {
    const path=process.env.TRAINING_DIAGNOSTICS_POLICY_PATH;
    if (!path) return disabledDiagnosticPolicy();
    if(path!==cachedPath || Date.now()-checkedAt>=5000) {
      cachedPath=path;checkedAt=Date.now();cachedRaw=undefined;
      if(statSync(path).size>32_768)return disabledDiagnosticPolicy();
      cachedRaw=readFileSync(path,"utf8");
    }
    if(!cachedRaw)return disabledDiagnosticPolicy();
    const config=JSON.parse(cachedRaw);
    if (config?.enabled!==true) return disabledDiagnosticPolicy();
    const now=Date.now();
    const until=userId ? config.users?.[userId] : undefined;
    const detailedUntil=Math.max(Date.parse(config.detailedUntil ?? "")||0,Date.parse(until ?? "")||0);
    const detailed=Number.isFinite(detailedUntil)&&detailedUntil>now&&detailedUntil<=now+86_400_000;
    const rate=config.successSampleRate;
    if (typeof rate!=="number"||!Number.isFinite(rate)||rate<0||rate>1) return disabledDiagnosticPolicy();
    return {enabled:true,detailed,successSampleRate:rate,validUntil:Math.min(now+90_000,detailed?detailedUntil:Infinity)};
  } catch { return disabledDiagnosticPolicy(); }
}
