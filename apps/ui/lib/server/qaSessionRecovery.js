const fs = require("node:fs");
const path = require("node:path");

function preserveQaRecoverySession(outputDir, session) {
  fs.mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  const jsonPath = path.join(outputDir, "prod-session.json");
  const temporary = `${jsonPath}.recovery-${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify({ session }), { mode: 0o600 });
  fs.renameSync(temporary, jsonPath);
  fs.chmodSync(jsonPath, 0o600);
  return jsonPath;
}

function readQaRecoveryAccessToken(sessionPath) {
  if (!sessionPath || !fs.existsSync(sessionPath)) return null;
  const payload = JSON.parse(fs.readFileSync(sessionPath, "utf8"));
  const accessToken = payload?.session?.access_token;
  if (typeof accessToken !== "string" || !accessToken) {
    throw new Error("Existing QA recovery artifact has no access token.");
  }
  return accessToken;
}

module.exports = { preserveQaRecoverySession, readQaRecoveryAccessToken };
