import { describe, expect, test } from "vitest";
import {
  escapeRegExp,
  maskTargetWordInDefinition,
} from "@/lib/training/trainingCardText";

describe("trainingCardText", () => {
  test("escapeRegExp escapes regex metacharacters", () => {
    expect(escapeRegExp("a+b?(c)[d]{e}|^$\\.")).toBe(
      "a\\+b\\?\\(c\\)\\[d\\]\\{e\\}\\|\\^\\$\\\\\\.",
    );
  });

  test("masks exact target words with punctuation boundaries", () => {
    expect(maskTargetWordInDefinition("Een huis, groot huis.", "huis")).toBe(
      "Een ..., groot ....",
    );
  });

  test("masks allowed inflected suffixes", () => {
    expect(maskTargetWordInDefinition("Het huisje en huiselijk.", "huis")).toBe(
      "Het ... en ....",
    );
  });

  test("masks apostrophe and hyphen suffix forms", () => {
    expect(
      maskTargetWordInDefinition("huis'lijk en huis-achtig", "huis"),
    ).toBe("... en ...");
  });

  test("matches casing while preserving surrounding text", () => {
    expect(maskTargetWordInDefinition("Huis en HUISJE blijven.", "huis")).toBe(
      "... en ... blijven.",
    );
  });

  test("returns input unchanged for empty text or headword", () => {
    expect(maskTargetWordInDefinition("", "huis")).toBe("");
    expect(maskTargetWordInDefinition("Een huis.", "")).toBe("Een huis.");
    expect(maskTargetWordInDefinition("Een huis.", "   ")).toBe("Een huis.");
  });

  test("does not mask inside another word", () => {
    expect(maskTargetWordInDefinition("thuis verhuizen, huis.", "huis")).toBe(
      "thuis verhuizen, ....",
    );
  });

  test("supports a custom placeholder", () => {
    expect(maskTargetWordInDefinition("Een huis.", "huis", "[...]")).toBe(
      "Een [...].",
    );
  });
});
