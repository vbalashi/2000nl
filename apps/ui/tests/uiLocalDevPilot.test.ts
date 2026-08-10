import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

describe("owner-review pilot launcher", () => {
  test("enables the complete existing Platform V2 Training profile", () => {
    const script = fs.readFileSync(
      path.resolve(process.cwd(), "../../scripts/ui-local-dev.sh"),
      "utf8",
    );
    const pilotBlock = script.match(
      /if \[\[ "\$pilot" == true \]\]; then([\s\S]*?)\nfi/,
    )?.[1];

    expect(pilotBlock).toBeDefined();
    expect(pilotBlock).toContain("export PLATFORM_V2_LOOKUP_ENABLED=1");
    expect(pilotBlock).toContain("export PLATFORM_V2_ACTIONS_ENABLED=1");
    expect(pilotBlock).toContain(
      "export NEXT_PUBLIC_PLATFORM_V2_TRAINING_UI=true",
    );
  });
});
