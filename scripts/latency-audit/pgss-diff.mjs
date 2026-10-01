import fs from "node:fs";

const [beforeFile, afterFile] = process.argv.slice(2);
const load = (f) => new Map(JSON.parse(fs.readFileSync(f, "utf8")).map((r) => [`${r.qid}:${r.role}`, r]));
const before = load(beforeFile);
const after = load(afterFile);
const rows = [];
for (const [k, a] of after) {
  const b = before.get(k) ?? { calls: 0, total: 0, plan: 0, tmp: 0 };
  const calls = a.calls - b.calls;
  if (calls <= 0) continue;
  rows.push({ fn: a.fn, role: a.role, calls, mean: (a.total - b.total) / calls, total: a.total - b.total, tmp: a.tmp - b.tmp });
}
const agg = new Map();
for (const r of rows) {
  const k = `${r.fn} [${r.role}]`;
  const x = agg.get(k) ?? { calls: 0, total: 0, tmp: 0 };
  x.calls += r.calls; x.total += r.total; x.tmp += r.tmp;
  agg.set(k, x);
}
console.log("fn [role] | calls | mean_ms | total_ms | tmp_blk");
for (const [k, x] of [...agg].sort((a, b) => b[1].total - a[1].total).slice(0, 40)) {
  console.log(`${k} | ${x.calls} | ${(x.total / x.calls).toFixed(1)} | ${x.total.toFixed(0)} | ${x.tmp}`);
}
