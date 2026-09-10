import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const finalTraining = process.argv.includes("--final-training");
const retired = ["onTrainingAction", "trainingActionEntryId"];
if (finalTraining) {
  retired.push("useLegacyTrainingReviewPort", "submitLegacyReview", "reviewLegacy",
    "projectTrainingCardPresentation", "TrainingCard", "TrainingCardPresentation",
    "FirstTimeButtonGroup", "AudioModeToggle", "InteractiveText");
}
const failures = [];

function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) scan(path);
    else if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) {
      const source = readFileSync(path, "utf8");
      for (const symbol of retired) {
        if (new RegExp(`\\b${symbol}\\b`).test(source)) {
          failures.push(`${relative(root, path)}: retired symbol ${symbol}`);
        }
      }
    }
  }
}

for (const directory of ["app", "components", "lib", "tests"]) {
  scan(resolve(root, "apps/ui", directory));
}
if (finalTraining) {
  for (const path of [
    "components/training/TrainingCard.tsx",
    "components/training/FirstTimeButtonGroup.tsx",
    "components/training/AudioModeToggle.tsx",
    "components/training/InteractiveText.tsx",
    "components/training/useLegacyTrainingReviewPort.ts",
    "lib/training/trainingCardPresentation.ts",
    "tests/TrainingCard.test.tsx",
    "tests/TrainingCard.translation.test.tsx",
    "tests/trainingCardPresentation.test.ts",
  ]) {
    if (existsSync(resolve(root, "apps/ui", path))) failures.push(`Not retired: ${path}`);
  }
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(finalTraining ? "Final Training retirement checks passed." : "Retired Details wiring stays absent.");
}
