import fs from "node:fs";

const files = process.argv.slice(2);
const recs = files.flatMap((f) => fs.readFileSync(f, "utf8").trim().split("\n").map((l) => JSON.parse(l)));
const q = (a, p) => {
  if (!a.length) return "-";
  const s = [...a].sort((x, y) => x - y);
  return Math.round(s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]);
};
const stat = (a) => (a.length ? `n=${a.length} p50=${q(a, 0.5)} p95=${q(a, 0.95)} max=${Math.round(Math.max(...a))}` : "n=0");
const st = (s) =>
  Object.fromEntries(
    (s ?? "").split(",").map((x) => x.trim()).filter(Boolean).map((x) => {
      const [n, ...rest] = x.split(";");
      const d = rest.find((r) => r.trim().startsWith("dur="));
      return [n.trim(), d ? Number(d.split("=")[1]) : 0];
    }),
  );
const pathKey = (r) => `${r.method} ${r.rpc ?? r.path}`;

const answers = recs.filter((r) => r.type === "answer" && typeof r.total === "number");
const renewed = (a) => a.events.some((e) => e.stage === "next-card.prefetch" && e.outcome === "renewal-required");
console.log(`answers=${answers.length}, session-complete=${recs.filter((r) => r.type === "answer" && r.outcome === "session-complete").length}, timeouts=${recs.filter((r) => r.type === "answer" && r.outcome === "timeout").length}`);
for (const d of [...new Set(answers.map((a) => a.dwell))].sort((a, b) => a - b)) {
  const g = answers.filter((a) => a.dwell === d);
  console.log(`dwell ${String(d).padStart(5)}ms: transition.total ${stat(g.map((a) => a.total))}; renewal rate ${(g.filter(renewed).length / g.length).toFixed(2)}`);
}
console.log(`with renewal    : ${stat(answers.filter(renewed).map((a) => a.total))}`);
console.log(`without renewal : ${stat(answers.filter((a) => !renewed(a)).map((a) => a.total))}`);
const ev = (stage, filter = () => true) => answers.flatMap((a) => a.events.filter((e) => e.stage === stage && filter(e, a)).map((e) => e.durationMs));
console.log(`review.mutation         ${stat(ev("review.mutation"))}`);
console.log(`review.mutation.request ${stat(ev("review.mutation.request"))}`);
console.log(`next-card.lookup (renewal) ${stat(ev("next-card.lookup", (e, a) => renewed(a)))}`);
console.log(`card.render             ${stat(ev("card.render"))}`);

const srv = {};
for (const a of answers) {
  for (const r of a.net ?? []) {
    if (!r.path?.startsWith("/api/")) continue;
    const t = st(r.serverTiming);
    const k = r.path;
    (srv[`${k} client-total`] ??= []).push(r.totalMs);
    for (const [n, v] of Object.entries(t)) (srv[`${k} ${n}`] ??= []).push(v);
    (srv[`${k} auth-miss`] ??= []).push("auth.get-user" in t ? 1 : 0);
  }
}
console.log("--- per-answer API requests: server timing (ms)");
for (const [k, v] of Object.entries(srv).sort()) {
  if (k.endsWith("auth-miss")) console.log(k.padEnd(62), `miss-rate=${(v.reduce((s, x) => s + x, 0) / v.length).toFixed(2)} n=${v.length}`);
  else console.log(k.padEnd(62), stat(v));
}
const perAnswer = answers.map((a) => (a.net ?? []).length);
console.log(`requests per answer ${stat(perAnswer)}`);
const bg = {};
for (const a of answers) for (const r of a.net ?? []) if (!r.path?.startsWith("/api/")) (bg[pathKey(r)] ??= []).push(r.totalMs);
console.log("--- per-answer direct Supabase requests (ms)");
for (const [k, v] of Object.entries(bg).sort((a, b) => b[1].length - a[1].length)) console.log(k.padEnd(62), stat(v));

const starts = recs.filter((r) => r.type === "start");
console.log(`--- session start click→first card: ${stat(starts.map((s) => s.ms))}`);
const sreq = {};
for (const s of starts) for (const r of s.net ?? []) (sreq[pathKey(r)] ??= []).push(r.totalMs);
for (const [k, v] of Object.entries(sreq).sort((a, b) => b[1].length - a[1].length)) console.log("  " + k.padEnd(60), stat(v));
const loads = recs.filter((r) => r.type === "load");
console.log(`--- page load → Start visible: ${stat(loads.map((l) => l.toStartVisibleMs))}`);
const lreq = {};
for (const l of loads) for (const r of l.net ?? []) (lreq[pathKey(r)] ??= []).push(r.totalMs);
for (const [k, v] of Object.entries(lreq).sort((a, b) => b[1].length - a[1].length)) console.log("  " + k.padEnd(60), stat(v));
