import fsSync from "fs";
import path from "path";

/**
 * Resolve the UI app's `public/` directory regardless of whether the dev server
 * was launched from the repo root or from `apps/ui`.
 */
export function resolveUiPublicDir(cwd: string): string {
  const direct = path.join(cwd, "public");
  if (fsSync.existsSync(direct)) return direct;

  const monorepo = path.join(cwd, "apps", "ui", "public");
  if (fsSync.existsSync(monorepo)) return monorepo;

  return direct;
}
