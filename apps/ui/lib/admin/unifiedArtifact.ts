import "server-only";

import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

/** Only switch legacy entry points when the paired static artifact has all routes. */
export async function hasUnifiedAdminArtifact(): Promise<boolean> {
  const directory = join(process.cwd(), "public", "admin", "reports");
  try {
    const [marker] = await Promise.all([
      readFile(join(directory, "assets", "admin-unified-v1.txt"), "utf8"),
      access(join(directory, "index.html")),
    ]);
    return marker.trim() === "2000nl-admin-routes-v1";
  } catch {
    return false;
  }
}
