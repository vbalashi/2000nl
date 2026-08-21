import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { migrateQaEnvFiles, migrateQaEnvText } from "./lib/qa-env-migration.mjs";

const legacy = "NEXT_PUBLIC_SITE_URL=http://localhost\nTEST_USER_EMAIL=reference@example.test\n";

test("migrates the legacy identity into an explicit dedicated QA policy", () => {
  const migrated = migrateQaEnvText(legacy);
  assert.equal((migrated.match(/^TEST_USER_EMAIL=/gm) ?? []).length, 0);
  assert.equal((migrated.match(/^QA_TEST_USER_EMAIL=test@2000nl\.test$/gm) ?? []).length, 1);
  assert.equal(
    (migrated.match(/^QA_TEST_USER_EMAIL_ALLOWLIST=test@2000nl\.test$/gm) ?? []).length,
    1,
  );
  assert.equal(
    (migrated.match(/^QA_REFERENCE_USER_EMAILS=reference@example\.test$/gm) ?? []).length,
    1,
  );
});

test("rejects ambiguous or already-migrated input", () => {
  assert.throws(() => migrateQaEnvText("NEXT_PUBLIC_SITE_URL=x\n"), /exactly one legacy/i);
  assert.throws(
    () => migrateQaEnvText(`${legacy}QA_TEST_USER_EMAIL=test@2000nl.test\n`),
    /already contains QA identity keys/i,
  );
});

test("migrates two temp fixtures as a validated batch and removes backups", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "qa-env-migration-test-"));
  const rootEnv = path.join(directory, "root.env");
  const uiEnv = path.join(directory, "ui.env");
  fs.writeFileSync(rootEnv, legacy, { mode: 0o600 });
  fs.writeFileSync(uiEnv, legacy.replace("localhost", "127.0.0.1"), { mode: 0o600 });

  const result = migrateQaEnvFiles([rootEnv, uiEnv]);

  assert.deepEqual(result, { migratedFiles: 2, backupsRemoved: 2 });
  assert.doesNotMatch(fs.readFileSync(rootEnv, "utf8"), /^TEST_USER_EMAIL=/m);
  assert.doesNotMatch(fs.readFileSync(uiEnv, "utf8"), /^TEST_USER_EMAIL=/m);
  assert.deepEqual(fs.readdirSync(directory).sort(), ["root.env", "ui.env"]);
});

test("restores the whole temp-fixture batch when any file is invalid", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "qa-env-rollback-test-"));
  const rootEnv = path.join(directory, "root.env");
  const uiEnv = path.join(directory, "ui.env");
  fs.writeFileSync(rootEnv, legacy, { mode: 0o600 });
  fs.writeFileSync(uiEnv, "NEXT_PUBLIC_SITE_URL=http://localhost\n", { mode: 0o600 });

  assert.throws(() => migrateQaEnvFiles([rootEnv, uiEnv]), /exactly one legacy/i);
  assert.equal(fs.readFileSync(rootEnv, "utf8"), legacy);
  assert.equal(fs.readFileSync(uiEnv, "utf8"), "NEXT_PUBLIC_SITE_URL=http://localhost\n");
});

test("restores every file and cleans temps when a commit rename fails", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "qa-env-rename-fail-test-"));
  const rootEnv = path.join(directory, "root.env");
  const uiEnv = path.join(directory, "ui.env");
  fs.writeFileSync(rootEnv, legacy, { mode: 0o600 });
  fs.writeFileSync(uiEnv, legacy, { mode: 0o600 });
  let renames = 0;
  const failingIo = {
    ...fs,
    renameSync(source, target) {
      renames += 1;
      if (renames === 2) throw new Error("injected rename failure");
      return fs.renameSync(source, target);
    },
  };

  assert.throws(() => migrateQaEnvFiles([rootEnv, uiEnv], failingIo), /injected rename failure/);
  assert.equal(fs.readFileSync(rootEnv, "utf8"), legacy);
  assert.equal(fs.readFileSync(uiEnv, "utf8"), legacy);
  assert.equal(fs.readdirSync(directory).some((name) => name.includes(".tmp")), false);
});

test("retains protected backups when rollback itself fails", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "qa-env-restore-fail-test-"));
  const rootEnv = path.join(directory, "root.env");
  const uiEnv = path.join(directory, "ui.env");
  fs.writeFileSync(rootEnv, legacy, { mode: 0o600 });
  fs.writeFileSync(uiEnv, legacy, { mode: 0o600 });
  let renames = 0;
  const failingIo = {
    ...fs,
    renameSync(source, target) {
      renames += 1;
      if (renames === 2) throw new Error("injected rename failure");
      return fs.renameSync(source, target);
    },
    copyFileSync() {
      throw new Error("injected restore failure");
    },
  };

  let caught;
  try {
    migrateQaEnvFiles([rootEnv, uiEnv], failingIo);
  } catch (error) {
    caught = error;
  }
  assert.match(caught?.message ?? "", /backups retained/i);
  assert.equal(fs.statSync(caught.recoveryDirectory).mode & 0o777, 0o700);
  assert.equal(fs.readdirSync(caught.recoveryDirectory).length, 2);
  assert.equal(fs.readdirSync(directory).some((name) => name.includes(".tmp")), false);
  fs.rmSync(caught.recoveryDirectory, { recursive: true, force: true });
});

test("retains backups and fails if a secret-bearing temp cannot be removed", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "qa-env-temp-cleanup-test-"));
  const rootEnv = path.join(directory, "root.env");
  const uiEnv = path.join(directory, "ui.env");
  fs.writeFileSync(rootEnv, legacy, { mode: 0o600 });
  fs.writeFileSync(uiEnv, legacy, { mode: 0o600 });
  let renames = 0;
  const failingIo = {
    ...fs,
    renameSync(source, target) {
      renames += 1;
      if (renames === 2) throw new Error("injected rename failure");
      return fs.renameSync(source, target);
    },
    unlinkSync(filename) {
      if (String(filename).includes(".qa-env-migration-")) {
        throw new Error("injected temp cleanup failure");
      }
      return fs.unlinkSync(filename);
    },
  };

  let caught;
  try {
    migrateQaEnvFiles([rootEnv, uiEnv], failingIo);
  } catch (error) {
    caught = error;
  }
  assert.match(caught?.message ?? "", /backups retained/i);
  assert.equal(fs.statSync(caught.recoveryDirectory).mode & 0o777, 0o700);
  assert.equal(fs.readdirSync(caught.recoveryDirectory).length, 2);
  fs.rmSync(caught.recoveryDirectory, { recursive: true, force: true });
});
