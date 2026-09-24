import { execFileSync, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

const repoRoot = path.resolve(process.cwd(), "../..");

describe("local launcher", () => {
  test("always selects the canonical current profile", () => {
    const script = fs.readFileSync(
      path.resolve(process.cwd(), "../../scripts/ui-local-dev.sh"),
      "utf8",
    );
    expect(script).toContain('export APP_ROLLOUT_PROFILE="pilot"');
    expect(script).toContain("--work-ref REF --expected-commit SHA");
    expect(script).toContain("scripts/qa-source.mjs");
    expect(script).toContain("scripts/check-qa-server.mjs");
    expect(script).toContain("SUPABASE_TELEMETRY_DISABLED=1");
    expect(script).toContain("DO_NOT_TRACK=1");
    expect(script).toContain('"$repo_root/scripts/db-local-supabase.sh" probe');
    const probePosition = script.indexOf('"$repo_root/scripts/db-local-supabase.sh" probe');
    expect(probePosition).toBeGreaterThanOrEqual(0);
    expect(probePosition).toBeLessThan(script.indexOf("scripts/check-qa-server.mjs"));
    expect(probePosition).toBeLessThan(script.indexOf("scripts/ensure-local-qa-account.js"));
    expect(script).not.toContain("export PLATFORM_V2_LOOKUP_ENABLED=");
    expect(script).not.toContain("export NEXT_PUBLIC_PLATFORM_V2_TRAINING_UI=");
  });

  test.each([
    {
      stale: true,
      existingServer: true,
      expectedStatus: 37,
      expectedCalls: ["supabase", "psql"],
    },
    {
      stale: false,
      existingServer: false,
      expectedStatus: 0,
      expectedCalls: ["supabase", "psql", "ensure-local-qa-account"],
    },
  ])(
    "gates account creation and Next startup on the local schema probe (stale=$stale, existingServer=$existingServer)",
    async ({ stale, existingServer, expectedStatus, expectedCalls }) => {
      const temp = fs.mkdtempSync(path.join(os.tmpdir(), "2000nl-ui-local-dev-"));
      const bin = path.join(temp, "bin");
      const callLog = path.join(temp, "calls.log");
      fs.mkdirSync(bin);
      const writeCommand = (name: string, source: string) => {
        const filename = path.join(bin, name);
        fs.writeFileSync(filename, source, { mode: 0o755 });
        fs.chmodSync(filename, 0o755);
      };

      writeCommand(
        "supabase",
        `#!/bin/bash
printf 'supabase\\n' >> "$QA_CALL_LOG"
cat <<'EOF'
API_URL="http://127.0.0.1:54321"
ANON_KEY="fixture-anon"
SERVICE_ROLE_KEY="fixture-service-role"
EOF
`,
      );
      writeCommand(
        "psql",
        `#!/bin/bash
printf 'psql\\n' >> "$QA_CALL_LOG"
if [[ "$QA_STALE_SCHEMA" == "true" ]]; then
  echo 'schema contract mismatch' >&2
  exit 37
fi
`,
      );
      writeCommand(
        "node",
        `#!/bin/bash
if [[ "${"$"}{1:-}" == *"scripts/ensure-local-qa-account.js" ]]; then
  printf 'ensure-local-qa-account\\n' >> "$QA_CALL_LOG"
  exit 0
fi
exec "$QA_REAL_NODE" "$@"
`,
      );
      writeCommand(
        "npm",
        `#!/bin/bash
printf 'npm %s\\n' "$*" >> "$QA_CALL_LOG"
`,
      );

      const head = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: repoRoot,
        encoding: "utf8",
      }).trim();
      const workRef = "446-local-schema-guard-test";
      let portServer: ReturnType<typeof createServer> | null = null;
      let port: number;
      if (existingServer) {
        portServer = createServer((_request, response) => {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({
            status: "ok",
            database: { target: "local" },
            checks: {
              platformRpcContract: { status: "ok" },
              dictionarySearchIndex: { status: "ok" },
              databaseContract: { status: "ok", details: { compatible: true } },
            },
            commit: head,
            qaSource: {
              dirty: false,
              mode: "preview",
              workRef,
              commit: head,
              checkoutPath: repoRoot,
            },
          }));
        });
        await new Promise<void>((resolve, reject) => {
          portServer?.once("error", reject);
          portServer?.listen(0, "127.0.0.1", resolve);
        });
        const address = portServer.address();
        if (!address || typeof address === "string") {
          throw new Error("Could not reserve a local UI test port.");
        }
        port = address.port;
      } else {
        const portReservation = createServer();
        await new Promise<void>((resolve, reject) => {
          portReservation.once("error", reject);
          portReservation.listen(0, "127.0.0.1", resolve);
        });
        const address = portReservation.address();
        if (!address || typeof address === "string") {
          throw new Error("Could not reserve a local UI test port.");
        }
        port = address.port;
        await new Promise<void>((resolve, reject) => {
          portReservation.close((error) => (error ? reject(error) : resolve()));
        });
      }

      try {
        const result = spawnSync(
          "bash",
          [
            path.join(repoRoot, "scripts/ui-local-dev.sh"),
            "--port",
            String(port),
            "--work-ref",
            workRef,
            "--expected-commit",
            head,
          ],
          {
            cwd: repoRoot,
            encoding: "utf8",
            timeout: 10_000,
            env: {
              ...process.env,
              PATH: `${bin}:${process.env.PATH}`,
              QA_CALL_LOG: callLog,
              QA_REAL_NODE: process.execPath,
              QA_STALE_SCHEMA: String(stale),
              LOCAL_SUPABASE_DB_URL:
                "postgresql://postgres:fixture-secret@127.0.0.1:54322/postgres",
            },
          },
        );
        const calls = fs.existsSync(callLog)
          ? fs.readFileSync(callLog, "utf8").trim().split("\n")
          : [];
        expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(expectedStatus);
        expect(calls.slice(0, expectedCalls.length)).toEqual(expectedCalls);
        if (stale) {
          expect(result.stderr).toContain("schema contract mismatch");
          expect(result.stdout).not.toContain("Starting UI against local Supabase");
          expect(calls).toHaveLength(expectedCalls.length);
        } else {
          expect(result.stdout).toContain("Starting UI against local Supabase");
          expect(calls).toHaveLength(expectedCalls.length + 1);
          expect(calls.at(-1)).toMatch(/^npm run dev -- --port \d+$/);
        }
      } finally {
        if (portServer) {
          await new Promise<void>((resolve, reject) => {
            portServer?.close((error) => (error ? reject(error) : resolve()));
          });
        }
        fs.rmSync(temp, { recursive: true, force: true });
      }
    },
  );
});
