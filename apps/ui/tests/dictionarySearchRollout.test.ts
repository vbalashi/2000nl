import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const repoRoot = path.resolve(__dirname, "../../..");
const read = (relativePath: string) =>
  fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

describe("dictionary search rollout ownership", () => {
  test("keeps the stable gated path out of rollout flags and unreachable branches", () => {
    const profiles = JSON.parse(
      read("apps/ui/config/rollout-profiles.json"),
    ) as Record<string, Record<string, boolean>>;
    const productionSources = [
      "apps/ui/components/training/wordlist/DictionarySearchTab.tsx",
      "apps/ui/components/training/wordlist/WordListTab.tsx",
      "apps/ui/lib/training/listService.ts",
      "apps/ui/lib/trainingService.ts",
    ].map(read);

    expect(profiles.legacy).not.toHaveProperty(
      "NEXT_PUBLIC_DICTIONARY_SEARCH_V2",
    );
    expect(profiles.pilot).not.toHaveProperty(
      "NEXT_PUBLIC_DICTIONARY_SEARCH_V2",
    );
    expect(productionSources.join("\n")).not.toContain(
      "NEXT_PUBLIC_DICTIONARY_SEARCH_V2",
    );
    expect(productionSources.join("\n")).not.toContain(
      "searchDictionaryEntriesV2",
    );
  });
});
