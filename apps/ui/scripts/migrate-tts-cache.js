#!/usr/bin/env node
/* eslint-disable no-console */

// One-time migration for the TTS on-disk cache layout.
//
// Old layout:
//   <cacheDir>/<key>.mp3
// New layout:
//   <cacheDir>/<key[0..1]>/<key>.mp3
//
// Usage:
//   node scripts/migrate-tts-cache.js
//   TTS_CACHE_DIR=/path/to/cache node scripts/migrate-tts-cache.js
//   node scripts/migrate-tts-cache.js --cache-dir /path/to/cache --dry-run

const fs = require("fs/promises");
const path = require("path");

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function defaultCacheDir() {
  return (
    process.env.TTS_CACHE_DIR ||
    path.join(process.env.TMPDIR || "/tmp", "2000nl-tts-cache")
  );
}

function isLegacyMp3FileName(name) {
  return /^[0-9a-f]{16}\.mp3$/.test(name);
}

async function main() {
  const cacheDir = path.resolve(getArg("--cache-dir") || defaultCacheDir());
  const dryRun = hasFlag("--dry-run");

  console.log(`[migrate-tts-cache] cacheDir=${cacheDir} dryRun=${dryRun}`);

  let dirEntries;
  try {
    dirEntries = await fs.readdir(cacheDir, { withFileTypes: true });
  } catch (err) {
    console.error(`[migrate-tts-cache] failed to read cacheDir: ${String(err)}`);
    process.exitCode = 1;
    return;
  }

  let moved = 0;
  let skipped = 0;
  let removedDuplicates = 0;
  let errors = 0;

  for (const ent of dirEntries) {
    if (!ent.isFile()) continue;
    if (!isLegacyMp3FileName(ent.name)) continue;

    const key = ent.name.slice(0, 16);
    const prefix = key.slice(0, 2);
    const srcPath = path.join(cacheDir, ent.name);
    const destDir = path.join(cacheDir, prefix);
    const destPath = path.join(destDir, ent.name);

    try {
      // If destination exists already, remove the legacy source file to avoid duplicates.
      const destExists = await fs
        .access(destPath)
        .then(() => true)
        .catch(() => false);

      if (destExists) {
        if (!dryRun) await fs.unlink(srcPath);
        removedDuplicates += 1;
        continue;
      }

      if (!dryRun) {
        await fs.mkdir(destDir, { recursive: true });
        await fs.rename(srcPath, destPath);
      }
      moved += 1;
    } catch (err) {
      errors += 1;
      console.error(
        `[migrate-tts-cache] error migrating ${srcPath} -> ${destPath}: ${String(err)}`
      );
    }
  }

  // Files already in subfolders are intentionally ignored; only legacy flat files are migrated.
  skipped = dirEntries.filter((e) => e.isFile() && !isLegacyMp3FileName(e.name)).length;

  console.log(
    `[migrate-tts-cache] moved=${moved} removedDuplicates=${removedDuplicates} skipped=${skipped} errors=${errors}`
  );

  if (errors > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`[migrate-tts-cache] fatal: ${String(err)}`);
  process.exitCode = 1;
});

