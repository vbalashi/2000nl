import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { persistQaSessionArtifacts } from "@/lib/server/qaSessionArtifacts";
import { readQaRecoveryAccessToken } from "@/lib/server/qaSessionRecovery";

const session = { access_token: "access-token", user: { id: "qa", email: "test@2000nl.test" } };

describe("persistQaSessionArtifacts", () => {
  it("rejects an existing tokenless recovery artifact", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "qa-tokenless-recovery-"));
    const recovery = path.join(directory, "prod-session.json");
    fs.writeFileSync(recovery, '{"session":{}}', { mode: 0o600 });
    expect(() => readQaRecoveryAccessToken(recovery)).toThrow(/no access token/i);
  });
  it("atomically persists both protected artifacts", async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-session-artifacts-"));
    const revoke = vi.fn(async () => {});
    await persistQaSessionArtifacts({ session, outputDir, revoke });
    expect(fs.readdirSync(outputDir).sort()).toEqual(["prod-session.b64", "prod-session.json"]);
    expect(revoke).not.toHaveBeenCalled();
  });

  it("revokes the in-memory session when persistence fails", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "qa-session-artifacts-fail-"));
    const outputDir = path.join(directory, "not-a-directory");
    fs.writeFileSync(outputDir, "fixture");
    const revoke = vi.fn(async () => {});
    await expect(persistQaSessionArtifacts({ session, outputDir, revoke })).rejects.toThrow();
    expect(revoke).toHaveBeenCalledWith("access-token");
  });

  it("retains a protected recovery artifact when persistence and revocation fail", async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-session-recovery-"));
    fs.mkdirSync(path.join(outputDir, "prod-session.b64"));
    const revoke = vi.fn(async () => {
      throw new Error("revoke failed");
    });
    await expect(persistQaSessionArtifacts({ session, outputDir, revoke })).rejects.toThrow(
      /recovery artifact retained/i
    );
    const recovery = path.join(outputDir, "prod-session.json");
    expect(fs.statSync(recovery).mode & 0o777).toBe(0o600);
    expect(JSON.parse(fs.readFileSync(recovery, "utf8")).session.access_token).toBe("access-token");
  });
});
