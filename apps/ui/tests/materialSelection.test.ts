import { expect, test } from "vitest";
import {
  addMaterialLanguage,
  materialLearningLanguages,
  moveMaterialLanguageUp,
  toggleMaterialLanguage,
  toggleMaterialDictionary,
} from "@/lib/training/material/selection";
import { emptyMaterialPreferences } from "@/lib/training/material/model";
const catalog = [
  {
    code: "nl",
    label: "Dutch",
    dictionaryCount: 1,
    curatedListCount: 1,
    userListCount: 0,
    hasTrainingEligibleLists: true,
  },
];
test("editing an implicit catalog materializes it while read-only display leaves storage alone", () => {
  const doc = emptyMaterialPreferences().document;
  expect(materialLearningLanguages(doc, catalog)).toEqual([
    { code: "nl", paused: false },
  ]);
  expect(doc.learningLanguages).toEqual([]);
  expect(addMaterialLanguage(doc, catalog, "pl").learningLanguages).toEqual([
    { code: "nl", paused: false },
    { code: "pl", paused: false },
  ]);
});
test("pausing/reordering preserves saved identities and the last active language", () => {
  const doc = addMaterialLanguage(
    emptyMaterialPreferences().document,
    catalog,
    "en",
  );
  const paused = toggleMaterialLanguage(doc, catalog, "en")!;
  expect(toggleMaterialLanguage(paused, catalog, "nl")).toBeNull();
  expect(
    moveMaterialLanguageUp(paused, catalog, "en")?.learningLanguages,
  ).toEqual([
    { code: "en", paused: true },
    { code: "nl", paused: false },
  ]);
  expect(addMaterialLanguage(paused, catalog, "en").learningLanguages).toEqual(
    doc.learningLanguages,
  );
  expect(doc.learningLanguages[1].paused).toBe(false);
});
test("dictionary editing preserves language configuration and uses dictionary identity", () => {
  const doc = emptyMaterialPreferences().document;
  const next = toggleMaterialDictionary(doc, "a");
  expect(next.disabledDictionaryIds).toEqual(["a"]);
  expect(toggleMaterialDictionary(next, "a")).toEqual(doc);
  expect(doc.disabledDictionaryIds).toEqual([]);
});
