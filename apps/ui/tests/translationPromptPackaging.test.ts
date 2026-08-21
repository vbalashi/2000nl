import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { loadPromptText } from "@/lib/translation/prompts/promptLoader";

describe("translation prompt packaging", () => {
  test("copies translation prompt text into the standalone production image", () => {
    const dockerfile = fs.readFileSync(path.join(process.cwd(), "Dockerfile"), "utf8");

    expect(dockerfile).toContain(
      "COPY --from=builder /workspace/apps/ui/lib/translation/prompts/*.txt ./lib/translation/prompts/",
    );
  });

  test("fails closed instead of silently sending an empty prompt", () => {
    expect(() => loadPromptText("missing-translation-prompt.txt")).toThrow(
      /translation prompt.*missing-translation-prompt\.txt/i,
    );
  });
});
