import { disabledDiagnosticPolicy, type DiagnosticPolicy } from "./policy";
export async function readDiagnosticPolicy(headers:()=>Promise<HeadersInit>, signal:AbortSignal):Promise<DiagnosticPolicy> {
  const auth=await headers();
  if(signal.aborted)return disabledDiagnosticPolicy();
  const response=await fetch("/api/diagnostics/training",{method:"GET",headers:auth,signal,cache:"no-store",credentials:"same-origin"});
  if(!response.ok)return disabledDiagnosticPolicy();
  const p=await response.json();
  if(typeof p.enabled!=="boolean"||typeof p.detailed!=="boolean"||typeof p.successSampleRate!=="number"||p.successSampleRate<0||p.successSampleRate>1||!Number.isFinite(p.validUntil)||p.validUntil>Date.now()+90_000)return disabledDiagnosticPolicy();
  return p;
}
