import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const repoRoot = path.resolve(process.cwd(), "../..");
const readRepoFile = (relativePath: string) =>
  fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

describe("production/test rollout profile wiring", () => {
  test("deploy selects pilot and passes the single profile through Docker", () => {
    const workflow = readRepoFile(".github/workflows/deploy-nuc.yml");
    const compose = readRepoFile("docker-compose.yml");
    const dockerfile = readRepoFile("apps/ui/Dockerfile");

    expect(workflow).toContain("APP_ROLLOUT_PROFILE: pilot");
    expect(workflow).toContain('PLATFORM_V2_TRANSLATION_EXERCISES_ENABLED: "true"');
    expect(compose).toContain(
      "APP_ROLLOUT_PROFILE: ${APP_ROLLOUT_PROFILE:?APP_ROLLOUT_PROFILE must be set}",
    );
    expect(dockerfile.match(/ARG APP_ROLLOUT_PROFILE/g)).toHaveLength(2);
    expect(dockerfile.match(/ENV APP_ROLLOUT_PROFILE=/g)).toHaveLength(2);
    expect(dockerfile.match(/ARG PLATFORM_V2_TRANSLATION_EXERCISES_ENABLED=false/g)).toHaveLength(2);
    expect(dockerfile.match(/ENV PLATFORM_V2_TRANSLATION_EXERCISES_ENABLED=/g)).toHaveLength(2);
    expect(compose).toContain("PLATFORM_V2_TRANSLATION_EXERCISES_ENABLED: ${PLATFORM_V2_TRANSLATION_EXERCISES_ENABLED:-false}");
  });
});
