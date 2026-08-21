import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const QA_EMAIL = "test@2000nl.test";
const MANAGED_KEYS = [
  "QA_TEST_USER_EMAIL",
  "QA_TEST_USER_EMAIL_ALLOWLIST",
  "QA_REFERENCE_USER_EMAILS",
];

function occurrences(text, key) {
  return text.match(new RegExp(`^${key}=.*$`, "gm")) ?? [];
}

export function migrateQaEnvText(text) {
  if (MANAGED_KEYS.some((key) => occurrences(text, key).length > 0)) {
    throw new Error("Env file already contains QA identity keys.");
  }

  const legacy = occurrences(text, "TEST_USER_EMAIL");
  if (legacy.length !== 1) {
    throw new Error("Env file must contain exactly one legacy TEST_USER_EMAIL key.");
  }
  const referenceEmail = legacy[0].slice("TEST_USER_EMAIL=".length);
  if (!referenceEmail.trim()) {
    throw new Error("Legacy TEST_USER_EMAIL reference identity is empty.");
  }

  const replacement = [
    `QA_TEST_USER_EMAIL=${QA_EMAIL}`,
    `QA_TEST_USER_EMAIL_ALLOWLIST=${QA_EMAIL}`,
    `QA_REFERENCE_USER_EMAILS=${referenceEmail}`,
  ].join("\n");
  const migrated = text.replace(/^TEST_USER_EMAIL=.*$/m, replacement);
  assertMigratedText(migrated, referenceEmail);
  return migrated;
}

function assertMigratedText(text, referenceEmail) {
  if (occurrences(text, "TEST_USER_EMAIL").length !== 0) {
    throw new Error("Legacy TEST_USER_EMAIL key remains after migration.");
  }
  for (const key of MANAGED_KEYS) {
    if (occurrences(text, key).length !== 1) {
      throw new Error(`Expected exactly one ${key} key after migration.`);
    }
  }
  if (occurrences(text, "QA_TEST_USER_EMAIL")[0] !== `QA_TEST_USER_EMAIL=${QA_EMAIL}`) {
    throw new Error("Dedicated QA identity classification is invalid.");
  }
  if (
    occurrences(text, "QA_TEST_USER_EMAIL_ALLOWLIST")[0] !==
    `QA_TEST_USER_EMAIL_ALLOWLIST=${QA_EMAIL}`
  ) {
    throw new Error("Dedicated QA allowlist classification is invalid.");
  }
  if (
    occurrences(text, "QA_REFERENCE_USER_EMAILS")[0] !==
    `QA_REFERENCE_USER_EMAILS=${referenceEmail}`
  ) {
    throw new Error("Reference identity was not preserved.");
  }
}

export function migrateQaEnvFiles(filenames, io = fs) {
  if (!Array.isArray(filenames) || filenames.length === 0) {
    throw new Error("At least one env file is required.");
  }

  const prepared = filenames.map((filename) => {
    const absolute = path.resolve(filename);
    const original = io.readFileSync(absolute, "utf8");
    return {
      absolute,
      original,
      migrated: migrateQaEnvText(original),
      mode: io.statSync(absolute).mode & 0o777,
    };
  });

  const backupDir = io.mkdtempSync(path.join(os.tmpdir(), "qa-env-migration-backup-"));
  io.chmodSync(backupDir, 0o700);
  const backups = prepared.map((entry, index) => {
    const backup = path.join(backupDir, `${index}.env`);
    io.writeFileSync(backup, entry.original, { mode: 0o600 });
    return backup;
  });
  const temporaries = prepared.map(
    (entry, index) => `${entry.absolute}.qa-env-migration-${process.pid}-${index}.tmp`,
  );

  const removeTemporaries = () => {
    const errors = [];
    for (const temporary of temporaries) {
      try {
        if (io.existsSync(temporary)) io.unlinkSync(temporary);
      } catch (error) {
        errors.push(error);
      }
    }
    return errors;
  };

  const removeBackups = () => {
    for (const backup of backups) io.unlinkSync(backup);
    io.rmdirSync(backupDir);
  };

  try {
    prepared.forEach((entry, index) => {
      const temporary = temporaries[index];
      io.writeFileSync(temporary, entry.migrated, { mode: entry.mode });
      io.chmodSync(temporary, entry.mode);
      io.renameSync(temporary, entry.absolute);
    });
    prepared.forEach((entry) => {
      const migrated = io.readFileSync(entry.absolute, "utf8");
      const reference = occurrences(entry.original, "TEST_USER_EMAIL")[0].slice(
        "TEST_USER_EMAIL=".length,
      );
      assertMigratedText(migrated, reference);
      if ((io.statSync(entry.absolute).mode & 0o777) !== entry.mode) {
        throw new Error("Env file permissions changed during migration.");
      }
    });
  } catch (error) {
    const restoreErrors = [];
    prepared.forEach((entry, index) => {
      try {
        io.copyFileSync(backups[index], entry.absolute);
        io.chmodSync(entry.absolute, entry.mode);
        if (
          io.readFileSync(entry.absolute, "utf8") !== entry.original ||
          (io.statSync(entry.absolute).mode & 0o777) !== entry.mode
        ) {
          throw new Error(`Restore verification failed for env file ${index}.`);
        }
      } catch (restoreError) {
        restoreErrors.push(restoreError);
      }
    });
    const cleanupErrors = removeTemporaries();
    if (restoreErrors.length > 0 || cleanupErrors.length > 0) {
      const recoveryError = new AggregateError(
        [error, ...restoreErrors, ...cleanupErrors],
        `QA env migration rollback failed; backups retained at ${backupDir}`,
      );
      recoveryError.recoveryDirectory = backupDir;
      throw recoveryError;
    }
    removeBackups();
    throw error;
  }

  const cleanupErrors = removeTemporaries();
  if (cleanupErrors.length > 0) {
    const recoveryError = new AggregateError(
      cleanupErrors,
      `QA env migration temp cleanup failed; backups retained at ${backupDir}`,
    );
    recoveryError.recoveryDirectory = backupDir;
    throw recoveryError;
  }
  removeBackups();

  return { migratedFiles: prepared.length, backupsRemoved: backups.length };
}
