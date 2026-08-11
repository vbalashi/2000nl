import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

describe("owner-review pilot launcher", () => {
  test("selects the canonical pilot profile instead of duplicating flags", () => {
    const script = fs.readFileSync(
      path.resolve(process.cwd(), "../../scripts/ui-local-dev.sh"),
      "utf8",
    );
    expect(script).toContain('export APP_ROLLOUT_PROFILE="$([[ "$pilot" == true ]]');
    expect(script).not.toContain("export PLATFORM_V2_LOOKUP_ENABLED=");
    expect(script).not.toContain("export NEXT_PUBLIC_PLATFORM_V2_TRAINING_UI=");
  });
});
