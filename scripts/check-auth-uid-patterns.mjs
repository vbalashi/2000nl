import fs from "node:fs";
import {pathToFileURL} from "node:url";
export function unoptimizedAuthUidLines(sql) {
 return sql.split("\n").flatMap((line,index) => {
  const code=line.replace(/--.*$/, "");
  // A PL/pgSQL UUID initializer runs once per invocation, not once per row.
  if (/^\s*(?:DECLARE\s+)?\w+\s+uuid\s*:=\s*auth\.uid\(\)\s*;/i.test(code)) return [];
  const unwrapped=code.replace(/\(\s*select\s+auth\.uid\(\)\s*\)/gi, "");
  return /auth\.uid\(\)/i.test(unwrapped) ? [index+1] : [];
 });
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
 for (const file of process.argv.slice(2)) {
  for (const line of unoptimizedAuthUidLines(fs.readFileSync(file,"utf8"))) {
   console.error(`::error file=${file},line=${line}::Wrap row-level auth.uid() in (select auth.uid())`);
   process.exitCode=1;
  }
 }
}
