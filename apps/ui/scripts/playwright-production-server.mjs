import { spawn, spawnSync } from "node:child_process";
import { cpSync } from "node:fs";
import { fileURLToPath } from "node:url";

const uiRoot = fileURLToPath(new URL("../", import.meta.url));
const build = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
  cwd: uiRoot,
  stdio: "inherit",
});
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);

// Match the standalone Docker layout, including assets omitted by file tracing.
cpSync(new URL("../public", import.meta.url), new URL("../.next/standalone/public", import.meta.url), { recursive: true });
cpSync(new URL("../.next/static", import.meta.url), new URL("../.next/standalone/.next/static", import.meta.url), { recursive: true });
const server = spawn(process.execPath, [".next/standalone/server.js"], {
  cwd: uiRoot,
  stdio: "inherit",
  env: { ...process.env, HOSTNAME: "0.0.0.0", PORT: "3100" },
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => server.kill(signal));
}
server.once("error", (error) => { console.error(error); process.exit(1); });
server.once("exit", (code) => process.exit(code ?? 1));
