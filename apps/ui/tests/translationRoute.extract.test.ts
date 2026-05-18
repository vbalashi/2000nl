import { describe, expect, test } from "vitest";
import { extractTranslatableTexts } from "@/app/api/translation/route";

describe("translation route text extraction", () => {
  test("extracts translatable text from user-entry-v1 payloads", () => {
    const items = extractTranslatableTexts({
      headword: "gedoe",
      gender: null,
      raw: {
        headword: "gedoe",
        languageCode: "nl",
        translation: {
          languageCode: "en",
          text: "hassle",
        },
        example: {
          source: "Wat een gedoe.",
        },
        notes: "Personal dictionary entry",
      },
    });

    expect(items).toEqual(
      expect.arrayContaining([
        { path: ["headword"], text: "gedoe" },
        { path: ["meanings", 0, "definition"], text: "hassle" },
        { path: ["meanings", 0, "context"], text: "Personal dictionary entry" },
        { path: ["meanings", 0, "examples", 0], text: "Wat een gedoe." },
      ]),
    );
  });
});
