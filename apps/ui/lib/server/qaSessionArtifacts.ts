import fs from "node:fs";
import path from "node:path";
import { preserveQaRecoverySession } from "./qaSessionRecovery";

export async function persistQaSessionArtifacts(input: {
  session: { access_token: string; [key: string]: unknown };
  outputDir: string;
  revoke: (accessToken: string) => Promise<void>;
}): Promise<void> {
  const jsonPath = path.join(input.outputDir, "prod-session.json");
  const b64Path = path.join(input.outputDir, "prod-session.b64");
  const suffix = `.tmp-${process.pid}`;
  const jsonTemp = `${jsonPath}${suffix}`;
  const b64Temp = `${b64Path}${suffix}`;
  try {
    fs.mkdirSync(input.outputDir, { recursive: true, mode: 0o700 });
    const payload = JSON.stringify({ session: input.session });
    fs.writeFileSync(jsonTemp, payload, { mode: 0o600 });
    fs.writeFileSync(b64Temp, Buffer.from(payload).toString("base64"), { mode: 0o600 });
    fs.renameSync(jsonTemp, jsonPath);
    fs.renameSync(b64Temp, b64Path);
  } catch (persistenceError) {
    let recoveryError: unknown = null;
    try {
      preserveQaRecoverySession(input.outputDir, input.session);
    } catch (error) {
      recoveryError = error;
    }
    let revocationError: unknown = null;
    try {
      await input.revoke(input.session.access_token);
    } catch (error) {
      revocationError = error;
    }
    for (const filename of [jsonTemp, b64Temp, b64Path]) {
      try {
        if (fs.existsSync(filename)) fs.unlinkSync(filename);
      } catch {
        // Recovery JSON remains the authoritative cleanup artifact.
      }
    }
    if (!revocationError) {
      try {
        if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
      } catch {
        // The server session is revoked; a protected stale local artifact is harmless.
      }
    }
    if (revocationError) {
      throw new AggregateError(
        [persistenceError, revocationError, ...(recoveryError ? [recoveryError] : [])],
        `QA session persistence and revocation both failed; recovery artifact retained at ${jsonPath}.`,
      );
    }
    throw persistenceError;
  }
}

export { preserveQaRecoverySession } from "./qaSessionRecovery";
